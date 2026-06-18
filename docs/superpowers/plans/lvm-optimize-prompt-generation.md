# LVM: 优化 Ideogram Prompt 生成（基于专家反馈）

> **动机**: 对生成的 Ideogram JSON prompt 进行了专家评审，发现 5 处致命问题。优化后生成的提示词质量更高，图像输出更可靠。

**注意**: 这是后续任务格式，其中 `generateJSON()` 以 `[y1, x1, y2, x2]` 格式生成 bbox，归一化到 [0, 1000]。

---

## 专家反馈总结

| # | 问题 | 严重性 | 当前状态 | 目标状态 |
|---|------|--------|----------|----------|
| 1 | BBox 坐标与空间描述不一致（LLM 输出矛盾） | 致命 | LLM 自由生成 bbox，无空间一致性约束 | 在 system prompt 中增加空间匹配约束，validation 扩展 |
| 2 | 中文文本渲染（Ideogram 对中文支持差） | 高 | system prompt 无文本语言限制 | 增加英文文本建议，增加验证警告 |
| 3 | 调色板过载（15 个颜色=无视觉重心） | 高 | global palette 允许 16 色；prompt 说 "max 16" | 限制到 5 色核心；prompt 改为 "max 5" |
| 4 | 叙事冲突（添加无关的三级元素破坏构图） | 中 | prompt 无相关约束 | 增加 "focus on primary subjects" 构图原则 |
| 5 | 冗余抽象语言（"壮丽感"等情感词→视觉污染） | 中 | prompt 无约束 | 增加 "use concrete visual descriptions" 指导 |

---

## Global Constraints

- **格式**: 所有 bbox 使用 `[y1, x1, y2, x2]` 格式，归一化坐标范围 [0, 1000]
- **颜色格式**: 6 字符大写 HEX（如 `#FF5733`）
- **类型限制**: `color_palette` 类型 = `string[]`（HEX 色值数组）
- **已有类型**: `IdeogramOutput`、`IdeogramElement`、`Box`（见 `src/types/index.ts`）
- **验证函数**: `extractAndValidateIdeogramJSON()` 在 `src/services/llm-canvas-chat.ts:177`
- **系统提示词**: `CANVAS_CHAT_SYSTEM_PROMPT` 在 `src/services/llm-canvas-chat.ts:14`
- **Store**: `useEditorStore` 在 `src/store/index.ts`（`addGlobalColor` 限制了 max 16）
- **测试**: 现有测试在 `src/services/__tests__/llm-canvas-chat.test.ts`
- **修改限制**: 不改动现有 UI 组件布局；不改动数据流；不改动业务逻辑语义

---

## Task 1: 优化系统提示词 — 颜色限制 + 文本语言 + 空间一致性 + 简洁描述

**目标文件**: `src/services/llm-canvas-chat.ts`（`CANVAS_CHAT_SYSTEM_PROMPT` 常量）

**修改**:
1. **全局调色板**: "max 16" → "max 5"（严格限制为 3-5 核心色）
2. **文本渲染**: 新增约束：text 类型元素的 `text` 字段建议使用英文（"Ideogram renders English text most reliably; avoid Chinese/other scripts"）
3. **空间一致性**: 新增 Design Principle：bbox 坐标必须与空间描述一致（"if an element's desc says 'bottom left', its bbox coordinates must place it in the lower-left quadrant"）
4. **简洁描述**: 新增 Design Principle：描述使用具体视觉词汇（"Use concrete visual descriptions (colors, shapes, textures, lighting, positions). Avoid abstract emotional language like '壮丽感', 'majestic feeling', 'tension and drama' — describe what is physically visible."）
5. **叙事聚焦**: 新增 Design Principle：聚焦核心主体（"Focus on the primary subject(s). Avoid adding minor tertiary elements that distract from the main composition. Aim for 2-4 well-developed elements rather than 6-8 crowded ones."）
6. 验证值: 使用具体文本值（如 "3-5 colors"、"2-4 elements"）

**测试更新 - 现有禁止性检查**:
- `src/services/__tests__/llm-canvas-chat.test.ts` — 不新增测试；仅更新现有 `CANVAS_CHAT_SYSTEM_PROMPT` 区块测试中的文本断言以反映新值

**不接受**:
- 不改动 `extractAndValidateIdeogramJSON` 验证逻辑
- 不改动 JSON Schema
- 不创建新文件

---

## Task 2: 降低 Store 全局调色板上限

**目标文件**: `src/store/index.ts`

**修改**:
1. `addGlobalColor`: 修改 `if (state.globalPalette.length >= 16) return false;` → `>= 5`

**不接受**:
- 不改动 per-box 调色板上限（保持 5）
- 不改动 UI 组件

---

## Task 3: 新增验证 — 颜色数量上限 + Chinese 文本警告

**目标文件**: `src/services/llm-canvas-chat.ts`（`extractAndValidateIdeogramJSON` 函数）

**修改**:
1. 全局 `color_palette` 验证：如果 global `color_palette.length > 5`，返回 null（新增约束）
2. per-element `color_palette` 验证：如果 `> 5`，返回 null（已有，但明确化）
3. Chinese 文本检测：对于 type=text 的元素，如果 `text` 字段包含 CJK 字符（Unicode 范围 \u4e00-\u9fff），返回 null（不再 silently accept）

**测试更新 - `src/services/__tests__/llm-canvas-chat.test.ts`**:
- 新增测试: global color_palette > 5 应返回 null
- 新增测试: per-element color_palette > 5 应返回 null  
- 新增测试: type=text 含 CJK 字符应返回 null
- 新增测试: global color_palette <= 5 应通过
- 新增测试: type=text 含纯英文应通过
- 新增测试: type=obj 的 desc 含 CJK 应通过（仅 text 字段受限）

---

## 验证计划

每个 Task 完成后运行:
```bash
cd /media/hr/Data/Codes/ideogram4-editor && npx vitest run src/services/__tests__/llm-canvas-chat.test.ts src/store/__tests__/index.test.ts
```
