# Canvas Chat 布局质量优化设计

## 概述

优化 Canvas Chat 的 LLM 输出质量，解决元素分布不均衡、box 过小、分布集中、缺乏设计感的问题。采用**系统提示词优化 + 后处理校验与反馈闭环**（Option C）策略，构建"生成→硬校验→软校验→反馈→重生成"的循环。

---

## 1. 整体架构

### 1.1 现有数据流

```
用户输入 → sendMessage() → LLM → JSON → extractAndValidate() → applyOutput()
```

### 1.2 改造后数据流

```
用户输入 → sendMessage()(content)
  → LLM → 回复文本
    → 硬校验: extractAndValidateIdeogramJSON (JSON 解析)
      → 失败 → 自动反馈 → LLM 重生成（最多 2 次自动重试）
      → 仍失败 → 展示最终错误，停止
    → 软校验: validateLayout (布局质量)
      → overallPass === true → applyOutput()
      → overallPass === false → 展示 LayoutQualityDialog(报告)
        → 用户点击"接受" → applyOutput()
        → 用户点击"重新生成" → 携带 layoutFeedback 再次调用 sendMessage
```

### 1.3 新增/修改文件

| 文件 | 变更 |
|------|------|
| `src/services/layout-validator.ts` | **新建** — 纯函数，6 项布局指标计算 + 报告生成 |
| `src/components/canvas/LayoutQualityDialog.tsx` | **新建** — 软校验不通过时展示问题详情 + 用户操作 |
| `src/services/llm-canvas-chat.ts` | **修改** — 优化 system prompt；新增 feedback 构建函数 |
| `src/hooks/useCanvasChat.ts` | **修改** — sendMessage 集成校验 + 重试逻辑 |
| `src/store/index.ts` | **修改** — 新增 pendingQualityReport 字段 |
| `src/i18n/translations.ts` | **修改** — 布局质量相关文案 |
| `src/services/__tests__/layout-validator.test.ts` | **新建** — 全面测试覆盖 |

### 1.4 关键设计决策

- `LayoutValidator` 为**纯函数**，不依赖 React / Zustand，可在 sendMessage 内部同步调用，也可独立测试
- 验证结果以**结构化报告**（`LayoutQualityReport`）而非自然语言传递，使 LLM 能逐条解析问题
- 硬/软校验的**阈值可配置**，通过 `LayoutValidationConfig` 传入，默认值内置于 validator

---

## 2. System Prompt 优化

### 2.1 设计原则

当前 prompt 的构图约束过于笼统（"Design a balanced composition — not too sparse, not too crowded"）。优化方向是将抽象概念替换为具体数值和准则，并嵌入反馈协议。

### 2.2 新增/修改的约束项

**数值约束**（与 validator 的默认阈值一致，提前引导 LLM 避坑）：

```
- 每个 box 至少占画布面积的 2%，否则会被判定过小
- 所有 box 总面积应覆盖画布 15%~60%，不足则布局空旷，过多则拥挤
- 元素间边缘间距 ≥ 画布短边的 3%，避免重叠或紧贴
- box 距画布边缘 ≥ 画布短边的 2%
- box 宽高比不超过 1:5 ~ 5:1（不能过于狭长）
- 推荐 2-6 个元素（比当前 1-8 更收敛）
```

**设计原则**（替代模糊的 "balanced"）：

```
- 三分法引导：建议关键元素沿画布 1/3 和 2/3 网格线放置
- 视觉锚点：至少 1 个元素占画布 15%+ 面积作为主要视觉焦点
- 呼吸空间：元素间留出足够的空白区域
- 尺寸节奏：元素尺寸应有明显差异（最大/最小 ≤ 8:1），避免千篇一律
```

### 2.3 Retry Protocol

新增 `## Retry Protocol` 节，定义当用户消息中出现 `[Layout Feedback]` 时的应对方式：

```
When you receive a [Layout Feedback] section in the user's message,
your previous composition was rejected. The feedback text itemizes every
issue by metric name. Address each issue specifically:
- element_area: sizes too small → increase dimension
- coverage: insufficient coverage → spread elements across more of canvas
- spacing: too tight → add breathing room
- Re-submit your entire composition as a new ```json block
```

### 2.4 Few-Shot 示例

附一个**好布局**示例（均匀分布、大小节奏、留白合理）和一个**差布局**示例（box 过小挤在角落），让 LLM 通过对比理解期望。

---

## 3. Layout Validator 服务

### 3.1 核心类型

```typescript
interface LayoutValidationConfig {
  minElementArea: number;       // 占画布百分比，默认 2
  minCoverage: number;          // 总面积下限，默认 15
  maxCoverage: number;          // 总面积上限，默认 60
  minGap: number;               // 元素间最小间距（画布短边%），默认 3
  minMargin: number;            // 距边缘最小距离（画布短边%），默认 2
  maxAspectRatio: number;       // 宽高比上限，默认 5
  minElementCount: number;      // 最少元素，默认 1
  maxElementCount: number;      // 最多元素，默认 8
}

interface MetricResult {
  field: string;                // 指标标识名
  passed: boolean;
  actual: number | number[];    // 当前值
  threshold: string;            // 阈值描述，如 "≥ 2%"
  message: string;              // 用户可读的问题描述
  detail?: string;              // 量化细节（哪些元素不达标等）
}

interface LayoutQualityReport {
  overallPass: boolean;         // 全部通过 = true
  metrics: MetricResult[];
  summaryText: string;          // 给 LLM 的结构化反馈文本
  userSummary: string;          // 给用户看的中文描述
}
```

### 3.2 核心函数

```typescript
function validateLayout(
  elements: IdeogramElement[],
  canvasW: number,
  canvasH: number,
  config?: Partial<LayoutValidationConfig>
): LayoutQualityReport
```

### 3.3 六项指标算法

| 指标 | 算法 | 默认阈值 |
|------|------|----------|
| `element_area` | `el.w * el.h < minAreaPct * canvasW * canvasH` | ≥ 2% |
| `coverage` | `sum(boxArea) / (canvasW * canvasH)` | 15%~60% |
| `spacing` | 每对 box 最小边缘间距（两个轴方向）| ≥ 短边 3% |
| `margin` | 每个 box 四边到画布边缘的最小距离 | ≥ 短边 2% |
| `element_count` | `elements.length` | 1-8 |
| `aspect_ratio` | `max(w/h, h/w)` | ≤ 5:1 |

**间距计算细节**：对任意两矩形 A、B，计算 X 轴重叠量和 Y 轴重叠量。若两个轴都不重叠，间距 = 最近轴间距离的最小值；若某一轴重叠，取另一轴间距。

**边缘计算细节**：对每个 box 的四条边（left/right/top/bottom）分别到画布对应边的距离，取全局最小值。

### 3.4 summaryText 格式

```
[Layout Feedback]
- element_area: 2 of 4 elements are too small (actual: 0.9%, 1.3%; threshold: ≥ 2%)
- coverage: 8% (threshold: 15-60%) — insufficient coverage, spread elements
- spacing: elements too close (min gap 0.5%, threshold: ≥ 3%)
Passed: element_count (4), aspect_ratio (all OK), margin (OK)
```

每行以 `- field:` 开头，便于 LLM 解析响应；`Passed:` 行列出已通过的指标，减少重复工作。

---

## 4. 反馈回路 + 交互流程

### 4.1 硬校验自动重试

```typescript
// 在 sendMessage 内，extractAndValidate 返回 null 时：
let retryCount = 0;
const MAX_HARD_RETRIES = 2;

function attemptGeneration(feedback?: string) {
  // 构造消息：原始请求 + 可选的反馈信息
  // 调 LLM → 尝试解析
  // 失败且 retryCount < MAX_HARD_RETRIES → retryCount++ 递归
  // 失败且 retryCount >= MAX_HARD_RETRIES → 展示错误，停止
}
```

- 重试时在聊天历史中追加一条 loading 状态消息："JSON 解析失败，正在重新生成..."
- 解析错误的具体原因（缺少 ```json 代码块、JSON.parse 失败、elements 为空等）转换为自然语言反馈注入 user message
- 重试间隔无延迟（即发即调）

### 4.2 软校验 UI（LayoutQualityDialog）

- **非阻塞提示条**（不打断工作流），悬浮在画布上方或右上角
- 内容：
  - 标题："布局质量检测结果"
  - 每个未通过指标一行：指标名 + 实际值 + 阈值
  - 两个按钮：**"接受当前布局"** / **"重新生成"**
- 点击"重新生成" → 调用 sendMessage(retry)，附上 `summaryText` 作为 feedback
- 点击"接受" → 执行 applyOutput，关闭 dialog

### 4.3 Store 变化

```typescript
// 新增字段
pendingQualityReport: LayoutQualityReport | null;
setPendingQualityReport: (report: LayoutQualityReport | null) => void;
```

---

## 5. 测试策略

### 5.1 layout-validator.test.ts（纯函数，无需 mock）

| 用例 | 验证点 |
|------|--------|
| 4 个均匀分布的大 box (各 ~20% 面积，均匀散布) | 全部通过 |
| 1 个极小 box (0.5% 面积) | 触发 element_area |
| 8 个 box 挤在角落 (覆盖率 5%) | 触发 coverage + spacing |
| 两个 box 完全重叠 | 触发 spacing |
| box 贴边 (距边 0.5%) | 触发 margin |
| box 宽高比 1:8 | 触发 aspect_ratio |
| 空 elements 数组 | 触发 element_count |
| 9 个元素 | 触发 element_count |
| 自定义 config 覆盖默认阈值 | 配置生效，阈值变更 |

### 5.2 useCanvasChat 集成测试（新增场景）

- LLM 返回非法 JSON → 自动重试一次后成功 → 结果被应用
- LLM 返回非法 JSON → 重试两次仍失败 → 用户看到错误消息
- LLM 返回合法但布局差的 JSON → 触发软校验 → pendingQualityReport 被设置
- 用户"重新生成" → sendMessage 再次被调用且带 feedback

### 5.3 回归

现有 `llm-canvas-chat.test.ts` 的 `extractAndValidateIdeogramJSON` 测试保持不变。

---

## 6. 验证方法

1. **硬校验重试** — 让 LLM 返回非法 JSON（在 prompt 中反向引导），确认自动重试触发且最多 2 次
2. **软校验触发** — 让 LLM 生成集中/过小的布局，确认 LayoutQualityDialog 弹出
3. **用户决策** — 在 Dialog 上分别点击"接受"和"重新生成"，确认行为正确
4. **反馈有效性** — 触发软校验后点击"重新生成"，检查传递给 LLM 的 message 中包含 `[Layout Feedback]` 且格式正确
5. **阈值可配** — 修改 config，确认不同阈值下判定结果变化
6. **测试覆盖** — `npm run test` 全部通过
7. **构建验证** — `npm run build` 无错误
