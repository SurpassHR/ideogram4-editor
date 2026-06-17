# Canvas AI Chat Panel — 设计规格

> 日期：2026-06-17 · 状态：设计已确认

## 概述

在 Artboard 内部底部新增一个画布级 AI 对话面板（Canvas Chat Panel）。用户输入主题意象，AI 根据当前画布状态（`generateJSON()` 实时结果）进行构图，返回结构化的 `IdeogramOutput` JSON（含 boxes 位置 + 描述 + 全局设置），用户通过确认弹窗选择性 Apply 到画布。

**核心理念**：从「手动摆框」到「语义构图」——画布即 JSON，JSON 即画布，形成闭环。

## 交互模式

**混合模式（C）**：首次生成是对话式（可多轮追问细化），每轮 AI 回复都尝试提取 JSON，解析成功则显示预览摘要 + Apply 按钮，用户可随时 Apply。失败则显示原始回复，用户继续对话让 AI 修正。

**Apply 策略（C）**：Apply 时弹出确认弹窗，用户可选择性应用：Boxes / 全局描述 / 风格参数 / 全局调色板 / 模式切换，默认全选。

**上下文策略**：每轮对话都将当前 `generateJSON()` 的实时结果作为上下文传入 LLM，确保 AI 看到最新的画布状态（包括用户手动调整后的结果）。

**与 per-box ChatPanel 的关系**：完全独立。Canvas Chat 有自己的对话历史、不绑定任何 box。per-box ChatPanel 不受影响。

## UI 方案

**方案 B — 可折叠对话面板**：
- **折叠态**：一条 32px 高的触发条，显示 "🤖 AI Compose — 输入主题意象，让 AI 帮你构图"，点击展开
- **展开态**：消息列表（max-height 200px，overflow-y: auto）+ 输入区 + Apply 按钮
- **位置**：Artboard 内部底部，不随画板 zoom/pan 变化（相对于 `.artboard` 容器固定定位）
- **视觉风格**：与 per-box ChatPanel 一致的暗色 glassmorphism 主题
- **关闭**：Apply 成功后自动折叠（保留确认信息 2s），也可手动折叠

## 组件架构

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/components/canvas/CanvasChatPanel.tsx` | 可折叠对话面板 UI 组件 |
| `src/hooks/useCanvasChat.ts` | Canvas Chat 逻辑 hook（发送/解析/Apply） |
| `src/services/llm-canvas-chat.ts` | Canvas 构图的 system prompt 构建 + JSON 提取/验证 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/components/canvas/Artboard.tsx` | 在 `CanvasArea` 下方（同层级 transform 容器外）插入 `CanvasChatPanel` |
| `src/store/index.ts` | 新增 `isCanvasChatOpen`、`canvasChatMessages`、`pendingIdeogramOutput` 字段及对应 actions |

## 数据流

```
用户输入主题意象
  → useCanvasChat.sendMessage(theme)
  → 构造 system prompt + 当前 generateJSON() 作为上下文
  → sendChatMessage(provider, model, messages, systemPrompt)
  → AI 返回文本（含 JSON 代码块）
  → extractAndValidateIdeogramJSON(aiText)
      ├─ 成功 → 存储 pendingIdeogramOutput，UI 显示预览摘要 + Apply 按钮
      └─ 失败 → 存储原始回复（标记解析错误），UI 显示原始文本 + 提示继续对话修正

用户点击 Apply
  → 弹出确认弹窗，勾选要应用的部分（默认全选）
  → 按勾选执行：
      - loadFromJSON(pendingIdeogramOutput) → 写入 boxes + 全局设置
      - 选择性跳过未勾选的字段
  → 消息标记为 adopted
  → 自动折叠面板
```

## Store 新增字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `isCanvasChatOpen` | `boolean` | `false` | 面板展开/折叠状态 |
| `canvasChatMessages` | `ChatMessage[]` | `[]` | Canvas Chat 对话历史 |
| `pendingIdeogramOutput` | `IdeogramOutput \| null` | `null` | 最新 AI 回复中成功提取的 JSON，待 Apply |
| `setCanvasChatOpen(open)` | action | — | 切换面板展开/折叠 |
| `addCanvasChatMessage(msg)` | action | — | 追加消息到对话历史 |
| `setPendingIdeogramOutput(output)` | action | — | 设置待应用的 JSON |
| `clearCanvasChat()` | action | — | 清空对话历史 + pending JSON |

> `chatModel`、`chatResponseLang`、LLM providers 复用现有字段，不重复创建。

## System Prompt 设计

### 结构

发给 LLM 的消息结构：
1. **System Prompt** — 角色说明 + IdeogramOutput JSON Schema 定义 + 构图约束规则
2. **User Message（上下文）** — 当前画布的 `generateJSON()` 结果（首次对话时为空模板）
3. **User Message（需求）** — 用户的构图需求文本
4. **后续轮** — 每轮始终附带当前 `generateJSON()` 作为最新上下文

### System Prompt 内容

```
You are an expert image composition designer for the Ideogram 4 image generation model.

Your task: given a user's thematic description and the current canvas state (as a JSON prompt),
design a complete visual composition. Return your composition as a valid IdeogramOutput JSON
object inside a ```json code block.

## JSON Schema
{ IdeogramOutput 完整 JSON Schema 说明 }

## Constraints
- Elements: 1-8 boxes, each with type ('obj' | 'text'), bbox [y1, x1, y2, x2] in 0-1000,
  desc (English, detailed visual description), optional text and color_palette
- bbox coordinates must be within [0, 1000]
- Colors: max 5 per box, 6-char hex uppercase (e.g., "#FF5733")
- Elements should not overlap excessively; leave room for background
- high_level_description: 1-2 sentence overall scene description
- style_description: include aesthetics, lighting, medium/art_style/photo based on mode,
  color_palette (max 16 global colors)

## Output Format
Always wrap your JSON in a ```json code block. You may add brief explanations outside the block.
Example:
```json
{ ...valid IdeogramOutput... }
```
```

### JSON 提取与验证

```typescript
function extractAndValidateIdeogramJSON(text: string): IdeogramOutput | null {
  // 1. 提取 ```json ... ``` 代码块
  // 2. JSON.parse()
  // 3. 验证结构：compositional_deconstruction.elements 存在且非空
  // 4. 验证每个 element：type ∈ ['obj','text'], bbox 4个值 ∈ [0,1000], desc 非空字符串
  // 5. 返回验证通过的 IdeogramOutput 或 null
}
```

## Apply 确认弹窗

Apply 时弹出确认弹窗（使用 `createPortal` → body），内容：

- ☑ Boxes（{N} 个边界框 + 描述 + 颜色）
- ☑ 全局描述（high_level_description）
- ☑ 风格参数（aesthetics / lighting / medium / art_style / background）
- ☑ 全局调色板（{M} 色）
- ☑ 模式切换（Art Style / Photo）

默认全选。用户取消勾选的项在 `loadFromJSON()` 时跳过对应字段的写入。弹窗有「Cancel」和「Apply Selected」两个按钮。

### 部分 Apply 实现

```typescript
// 原则：逐字段写入，不使用 loadFromJSON()（它会一次性覆盖全部全局设置，
// 与选择性 Apply 冲突）。boxes 始终从 JSON 解析后通过 store actions 写入。
function selectiveLoadFromJSON(
  json: IdeogramOutput,
  selections: ApplySelections,
  store: EditorStore
): void {
  if (selections.boxes) {
    // parseBoxesFromJSON 来自 utils/json-serializer.ts
    const boxes = parseBoxesFromJSON(json, store.canvasW, store.canvasH);
    const { addBox, clearBoxes } = store;
    clearBoxes();
    boxes.forEach(b => addBox(b));
  }

  const sd = json.style_description;
  if (selections.globalDesc) store.setGlobalSetting('highLevelDescription', json.high_level_description);
  if (selections.styleParams) {
    store.setGlobalSetting('aesthetics', sd.aesthetics);
    store.setGlobalSetting('lighting', sd.lighting);
    store.setGlobalSetting('background', json.compositional_deconstruction.background);
    if ('photo' in sd) {
      store.setPhotoArtStyleMode(MODE_PHOTO);
      store.setGlobalSetting('medium', sd.photo || '');
      store.setGlobalSetting('artStyle', sd.medium || '');
    } else {
      store.setPhotoArtStyleMode(MODE_ARTSTYLE);
      store.setGlobalSetting('medium', sd.medium || '');
      store.setGlobalSetting('artStyle', sd.art_style || '');
    }
  }
  if (selections.globalPalette) {
    store.clearGlobalPalette();
    (sd.color_palette || []).forEach(c => store.addGlobalColor(c));
  }
}
```

## 错误处理

| 场景 | 行为 |
|------|------|
| **JSON 解析失败** | 保留原始 AI 回复文本，显示在消息气泡中并标记「未检测到有效 JSON」，不显示 Apply 按钮。用户可继续对话让 AI 修正 |
| **LLM API 错误** | 与 per-box ChatPanel 一致的 error 状态展示 + 自动重试机制 |
| **无 LLM 提供商** | 提示用户先到 `/#/settings` 配置 LLM 提供商 |
| **JSON 格式正确但内容不合规** | 视为解析失败（同第一条），将不合规原因简要提示 |
| **折叠态意外丢失状态** | `pendingIdeogramOutput` 和 `canvasChatMessages` 存储在 Zustand store 中，折叠不丢失 |

## 样式与交互细节

- **折叠态触发条**：高 32px，背景半透明，居中显示提示文字，hover 时高亮
- **展开态面板**：最大高度 250px（消息列表 150px + 输入区 100px），整体不超出 Artboard 的 40%
- **消息列表**：`overflow-y: auto`，新消息自动滚动到底部
- **输入区**：textarea（2 行，Enter 发送，Shift+Enter 换行）+ Send 按钮 + Apply 按钮
- **Apply 按钮**：仅当 `pendingIdeogramOutput !== null` 时显示，accent 色高亮
- **加载状态**：发送时输入区禁用 + 按钮显示 loading spinner
- **成功确认**：Apply 后显示 "✅ Applied {N} boxes" 2 秒 → 自动折叠
- **复用组件**：`ChatMessage`（用户/AI 消息气泡）、`SelectMenu`（模型/语言选择，可选集成到展开态 toolbar）
- **不随缩放移动**：Panel 定位在 `.artboard` 容器底部，位于 transform 容器之外

## 测试策略

- `extractAndValidateIdeogramJSON` 纯函数单元测试：有效 JSON / 无代码块 / 格式不完整 / bbox 越界 / 缺少必要字段
- `useCanvasChat` hook 测试：发送消息 / 解析成功 / 解析失败 / Apply 部分选项
- `CanvasChatPanel` 组件测试：折叠/展开切换 / 消息列表渲染 / Apply 按钮出现/消失
- Store actions 测试

## 实施依赖

- `useCanvasChat` 依赖现有 `sendChatMessage()`（支持所有已配置的 LLM provider）
- `CanvasChatPanel` 复用 `ChatMessage` 组件
- Apply 依赖现有 `loadFromJSON()` + 选择性字段写入
- LLM 配置依赖现有 `/#/settings` 页面，无需改动

## 不在范围内

- 流式输出（SSE streaming）— 后续迭代
- 画布上下文中包含已生成的图片数据（`includeImageData`）— 后续评估 token 消耗后决定
- Canvas Chat 级别的预设模板 — 后续迭代
- 与 per-box ✨ ChatPanel 的双向联动 — 独立工作，不联动
