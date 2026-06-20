# Chat 控制与 JSON 预览设计

> 日期：2026-06-20 · 状态：设计已确认

## 概述

本次设计同时优化三个位置：

1. 在 Canvas Chat 和 Box Chat 面板中增加 `Stream` 开关与 `Think` 四档滑块。
2. 调整 Canvas Chat 的 Apply 与布局质量检测时序：JSON 合法才显示 Apply；点击 Apply 后先落地布局，再展示布局质量诊断面板。
3. 在 JSON prompt 区右上角增加 `JSON / Preview` 切换，支持在代码与只读画布预览之间切换。

目标是让 AI 生成链路更可控，同时让用户在 Apply 后立即看到可检查的画布布局，而不是被尚未落地的校验结果打断。

## 已确认决策

- Chat 控制采用共享配置：Box Chat、Canvas Chat 普通态和 Canvas Chat 最大化态共用同一组 `Stream` 与 `Think` 设置。
- `Stream` 默认开启，并持久化到 `localStorage`。
- `Think` 使用 `Off / Low / Medium / High` 四档滑块，默认 `Medium`，并持久化到 `localStorage`。
- 控件摆放采用 A 方案：固定在模型工具条内，位于模型/语言选择附近。
- `Apply` 不再打开确认弹窗，也不再提供弹窗内的选择性应用 checkbox。
- AI 回复后先做 JSON 解析与结构校验；只有校验成功才显示 `Apply`。
- 点击 `Apply` 后立即将 AI 返回内容写入画布与全局设置，然后弹出布局质量诊断面板。
- 布局质量诊断面板不是失败弹窗；它展示已落地布局的检测结果与建议。JSON 校验失败时不进入 Apply，也不显示布局质量面板。
- JSON 区切换采用右上角 segmented toggle：`JSON` 显示可编辑代码，`Preview` 显示只读缩略画布。

## 范围

### 本次范围

- 扩展 `src/store/index.ts`，增加共享 Chat 运行配置与持久化。
- 扩展 LLM 服务层，让发送请求时可以传入 `streamEnabled` 与 `thinkingLevel`。
- 更新 `src/hooks/useChatPanel.ts` 和 `src/hooks/useCanvasChat.ts`，根据共享配置选择流式或非流式发送。
- 更新 `src/components/chat/ChatPanel.tsx` 与 `src/components/canvas/CanvasChatPanel.tsx` 的工具条控件。
- 移除 Canvas Chat Apply 确认弹窗，改为一键 Apply。
- 调整布局质量检测：从“AI 回复解析成功后写入 pending report”改为“Apply 落地后生成并展示 report”。
- 更新 `src/components/canvas/LayoutQualityDialog.tsx`，让它可以展示通过与未通过两种诊断结果。
- 更新 `src/components/json/JsonToolbar.tsx`，增加 JSON/Preview 切换与只读画布预览。
- 补充 store、service、hook、组件测试。

### 非本次范围

- 不引入新的 UI 组件库。
- 不改变 LLM provider 配置面板的数据结构。
- 不实现按 provider 单独保存 Stream/Think 配置。
- 不实现 JSON 预览中的可拖拽编辑；预览只读。
- 不在 Apply 中保留弹窗式局部应用选择；后续若需要局部应用，应另行设计为非阻塞的高级选项。

## 当前代码背景

| 文件 | 当前职责 | 本次影响 |
| --- | --- | --- |
| `src/store/index.ts` | Zustand 单一状态源，含 chat model、Canvas Chat session、pending output/report | 增加共享 Chat 运行配置，调整 pending quality report 写入时机 |
| `src/hooks/useChatPanel.ts` | Box Chat provider/model 解析、流式发送、采纳回复 | 接入 Stream/Think 配置，并支持非流式发送 |
| `src/hooks/useCanvasChat.ts` | Canvas Chat 发送、画布上下文、JSON 解析、Apply、布局校验 | 接入 Stream/Think 配置；Apply 一键落地；Apply 后生成诊断 report |
| `src/services/llm-stream.ts` | SSE 流式服务层 | 增加请求选项，支持 reasoning 参数映射 |
| `src/services/llm-chat.ts` | 非流式 LLM 服务与 prompt 构建 | 复用为 Stream 关闭时的聚合返回路径，或抽出统一请求适配层 |
| `src/components/chat/ChatPanel.tsx` | Box Chat 浮动面板 | 工具条增加 Stream 开关与 Think 滑块 |
| `src/components/canvas/CanvasChatPanel.tsx` | Canvas Chat 普通态、最大化态、Apply UI | 工具条增加控件；移除 Apply 确认弹窗 |
| `src/components/canvas/LayoutQualityDialog.tsx` | 布局质量弹窗 | 改为 Apply 后诊断面板，支持通过态与建议态 |
| `src/components/json/JsonToolbar.tsx` | JSON prompt 生成、粘贴加载 | 增加 JSON/Preview 切换与只读预览 |
| `src/index.css` | 全局样式与面板样式 | 增加紧凑控制条、四档滑块、JSON 预览样式 |
| `src/i18n/translations.ts` | 中英 UI 文案 | 增加新增控件与诊断面板文案 |

## 交互设计

### Chat 工具条

两个 Chat 面板的工具条结构保持一致：

```text
[Preset] [Model] [Lang] [Stream toggle] [Think slider] [spacer] [Clear/Collapse]
```

Canvas Chat 最大化态中，中间聊天区的输入工具条复用同一组控件。普通态空间较小时，`Think` 使用短标签：

```text
Think: Off / Low / Med / High
```

控件语义：

- `Stream` 是二态开关。开启时逐 token 更新；关闭时等待完整回复后一次性写入 assistant 消息。
- `Think` 是四档 slider。`Off` 表示不请求显式 reasoning；`Low / Medium / High` 表示请求不同强度的 reasoning。
- 如果当前 provider 不支持显式 reasoning 参数，UI 仍显示当前设置，但请求层不发送不兼容参数。控件 tooltip 说明“具体效果取决于当前模型能力”。

视觉方向：

- 沿用现有暗色控制台气质，不新增品牌主色。
- `Stream` 用小型 toggle，开态使用现有 accent 色。
- `Think` 用短轨道 slider，四个停靠点稳定对齐，避免工具条宽度跳动。
- 控件高度与 `SelectMenu` 保持一致，防止 Chat 面板因为工具条增高而压缩消息区。

### Canvas Chat Apply 与布局质量诊断

新时序：

```text
AI 回复
  -> JSON 解析与结构校验
    -> 成功：显示 Apply
    -> 失败：不显示 Apply，在对话和请求日志中展示解析错误
点击 Apply
  -> 将 pending IdeogramOutput 写入画布和全局设置
  -> 基于已写入的 boxes 运行布局质量检测
  -> 弹出布局质量诊断面板
```

关键点：

- `Apply` 是一键动作，不再二次确认。
- 能看到 `Apply` 就代表 JSON 已经通过结构校验。
- JSON 结构校验失败与布局质量诊断是两件事：前者决定能否 Apply，后者帮助用户检查已落地布局。
- 诊断面板必须在布局已经出现在画布上之后出现，用户可以看着真实布局判断是否接受建议。

诊断面板动作：

- `保留布局`：关闭面板，保留当前画布。
- `重新生成`：关闭面板，使用当前诊断建议作为 feedback 发起新一轮 Canvas Chat 请求。

诊断内容：

- 全部通过时显示通过态摘要，例如“布局检测通过”，并列出关键指标。
- 存在建议时显示建议态摘要，例如“发现 2 项布局建议”，并列出面积、覆盖率、间距、边距、宽高比、元素数量等指标。

### JSON / Preview 切换

`JsonToolbar` 保留现有生成与加载按钮，在右上角增加切换：

```text
[Generate JSON] [Load from pasted]                         [JSON | Preview]
```

`JSON` 模式：

- 显示现有 textarea。
- 用户可编辑、粘贴 JSON。
- `Load from pasted` 行为保持不变。

`Preview` 模式：

- 显示只读缩略画布。
- 优先从当前 `jsonText` 解析预览源。
- 如果 `jsonText` 为空，则使用当前 store 的 `generateJSON()` 结果作为预览源。
- 如果 `jsonText` 非空但解析失败，显示内联错误提示，不弹 `alert`。
- 预览中的 boxes 按 bbox 转换为百分比定位，显示文本/对象标签、颜色条与全局描述摘要。
- 预览不修改 store，不触发选择、拖拽、聊天或快捷键。

## 状态设计

### Store 新增字段

```typescript
type ChatThinkingLevel = 'off' | 'low' | 'medium' | 'high';

interface EditorStore {
  chatStreamEnabled: boolean;
  chatThinkingLevel: ChatThinkingLevel;
  setChatStreamEnabled: (enabled: boolean) => void;
  setChatThinkingLevel: (level: ChatThinkingLevel) => void;
}
```

持久化 key：

- `ideogram4-chat-stream-enabled`
- `ideogram4-chat-thinking-level`

默认值：

- `chatStreamEnabled: true`
- `chatThinkingLevel: 'medium'`

### LLM 请求选项

服务层增加统一选项：

```typescript
interface ChatRunOptions {
  streamEnabled: boolean;
  thinkingLevel: ChatThinkingLevel;
}
```

`sendChatMessageStream()` 可以继续负责流式调用，但 hook 层需要一个统一发送入口：

```typescript
sendChatMessageWithOptions(provider, model, messages, systemPrompt, callbacks, {
  imageDataUrl,
  streamEnabled,
  thinkingLevel,
});
```

实现可以拆成两个内部路径：

- `streamEnabled === true`：走 SSE，沿用 `onChunk` 更新占位消息。
- `streamEnabled === false`：走非流式请求，收到完整文本后调用一次 `onChunk({ type: 'content', text })` 和 `onDone(text)`。

### Thinking 参数映射

初期映射策略：

| Provider | `Off` | `Low / Medium / High` |
| --- | --- | --- |
| OpenAI | 不发送 `reasoning_effort` | 对支持 reasoning 的模型发送 `reasoning_effort: low / medium / high` |
| Anthropic | 不发送 thinking 配置 | 对支持 thinking 的模型发送不同 `budget_tokens` |
| Gemini | 不发送 thinking 配置 | 对支持 thinking 的模型发送 `thinkingConfig` 或等价参数 |
| OpenAI compatible | 默认不发送扩展参数 | 仅在兼容提供商明确支持时再扩展 |

如果 provider 或模型不支持对应参数，请求层必须静默降级，不应导致请求失败。

## 数据流

### Box Chat

```text
用户输入
  -> useChatPanel.sendMessage()
  -> 读取 chatStreamEnabled/chatThinkingLevel
  -> 创建 user message
  -> 创建 assistant 占位消息
  -> 统一 LLM 发送入口
  -> 流式：逐 chunk 更新占位消息
  -> 非流式：完整返回后更新占位消息
  -> 用户可采纳 assistant content 到 box.desc
```

### Canvas Chat

```text
用户输入
  -> useCanvasChat.sendMessage()
  -> 读取 chatStreamEnabled/chatThinkingLevel
  -> 创建请求日志与 user message
  -> 截图、构建 canvas context
  -> 创建 assistant 占位消息
  -> 统一 LLM 发送入口
  -> 完成后解析 JSON
    -> 解析成功：setPendingIdeogramOutput(output)，显示 Apply
    -> 解析失败：记录 parse_failed，不显示 Apply
点击 Apply
  -> applyOutput()
  -> 写入 boxes/global/style
  -> validateLayout(已写入 boxes)
  -> setPendingQualityReport(report)
  -> LayoutQualityDialog 展示 report
```

## 错误处理

- Provider 或 model 缺失：保持现有错误提示，禁用发送或在消息中展示错误。
- Stream 请求失败：占位 assistant 消息追加错误文本，请求日志标记 error。
- 非流式请求失败：写入同样的错误消息，不创建空白 assistant。
- JSON 解析失败：保留 assistant 原文，在请求日志和消息中提示解析原因，不显示 Apply。
- JSON Preview 解析失败：只在 JSON 区显示内联错误，不影响当前画布。
- Thinking 参数不支持：请求层降级，不阻断聊天。

## 测试计划

### 单元测试

- Store：
  - 默认 `chatStreamEnabled` 为 true。
  - 默认 `chatThinkingLevel` 为 medium。
  - 两个 setter 会写入 `localStorage`。
  - 非法持久化值会回退默认值。
- LLM 服务：
  - stream enabled 时仍调用 SSE 路径。
  - stream disabled 时调用非流式路径并一次性返回。
  - OpenAI reasoning effort 映射正确。
  - 不支持 provider 时不发送未知 thinking 参数。
- `useChatPanel`：
  - 发送时读取共享配置。
  - stream disabled 时 assistant 消息一次性更新。
- `useCanvasChat`：
  - JSON 解析成功后显示 pending output。
  - JSON 解析失败时不显示 Apply。
  - 点击 Apply 后写入 boxes，并设置布局质量 report。
  - Apply 不打开确认弹窗。

### 组件测试

- `ChatPanel`：
  - 工具条渲染 Stream 开关和 Think 四档控件。
  - 切换控件调用 store setter。
- `CanvasChatPanel`：
  - 普通态和最大化态都渲染共享控件。
  - 有 pending output 时显示 Apply。
  - 点击 Apply 后不出现确认弹窗。
- `LayoutQualityDialog`：
  - 通过态可以展示并关闭。
  - 建议态展示 failed metrics 和重新生成按钮。
- `JsonToolbar`：
  - 默认 JSON 模式显示 textarea。
  - 切到 Preview 后显示只读画布。
  - 无 JSON 文本时预览当前 store。
  - JSON 文本非法时显示内联错误。

### 验证命令

```bash
npm run test
npm run build
```

涉及 UI 布局时，补充浏览器截图验证：

```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}" && \
export PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh" && \
xvfb-run --server-args="-screen 0 1280x1024x24" "$PWCLI" open http://localhost:5173 --headed 2>&1
```

## 实施顺序建议

1. 先加 store 配置与持久化测试。
2. 再抽统一 LLM 发送入口，保证 stream on/off 行为可测试。
3. 接入 Box Chat 和 Canvas Chat 工具条。
4. 调整 Canvas Chat Apply 流程和布局质量诊断面板。
5. 实现 JSON Preview。
6. 最后补齐 i18n、CSS、组件测试和视觉验证。

## 自查结果

- 没有未完成条目。
- JSON 结构校验与布局质量诊断已拆成两个独立阶段。
- Apply 时序明确为“一键落地后诊断”，不会出现未落地布局却要求用户检查的问题。
- Scope 聚焦于 Chat 控制、Apply 诊断与 JSON 预览，没有引入 provider 管理或画布编辑重构。
