# Canvas Chat 终端调试与尺寸滑块优化设计

> 日期：2026-06-21 · 状态：设计已确认

## 概述

本次优化聚焦 `CanvasChatPanel` 最大化工作台里的右侧终端日志，以及 Canvas Chat 工具条中的目标尺寸滑块。

当前终端日志只展示请求预览和步骤摘要。Canvas Chat 在 JSON 解析失败时，用户无法直接看到最终发给模型的完整 prompt，也无法看到模型原始返回，因此很难判断错误来自请求约束、模型返回格式、JSON 片段缺失，还是 bbox 等字段结构错误。目标尺寸滑块也和已有思考级别滑块视觉不一致，占用工具条空间更多。

本次设计采用“步骤列表 + 详情弹窗”的方式：右侧终端继续保持清爽的请求步骤索引；用户点击关键步骤后通过模态详情弹窗查看完整调试信息。尺寸滑块改为和思考级别滑块一致的紧凑横向形态。

## 已确认决策

- 终端日志采用 B 方案：右侧 Terminal 保持步骤列表，点击步骤查看完整详情。
- 完整日志记录范围采用 B 方案：记录最终请求、原始返回、解析 JSON 片段、解析错误、provider/model、目标尺寸和思考级别。
- 不记录每个流式 chunk，避免日志噪音和 `localStorage` 膨胀。
- 目标尺寸滑块直接对齐思考级别滑块的紧凑横向样式，不再使用竖向排列和独立刻度行。
- 本次只优化 Canvas Chat，不改变 per-box `ChatPanel` 的终端能力。

## 范围

### 本次范围

- 扩展 Canvas Chat 请求日志数据结构，保存可排查问题的完整请求与响应详情。
- 在 `useCanvasChat.sendMessage()` 中记录最终发给 LLM 的 system prompt、messages、运行参数和完整原始返回。
- JSON 解析成功时记录可读的 JSON 片段摘要；解析失败时记录完整原始返回与明确失败原因。
- 更新 Canvas Chat 最大化态右侧 Terminal，让步骤行可以打开模态详情弹窗。
- 详情视图使用 monospace、可滚动、可复制的块展示 `Request`、`Response`、`Parsed JSON`、`Error` 和 `Metadata`。
- 将 Canvas Chat 目标尺寸控件调整为与 `ChatRunControls` 中思考级别滑块一致的横向紧凑控件。
- 补充类型、store、hook、组件测试。

### 非本次范围

- 不记录逐 token 的流式 chunk。
- 不新增独立 Debug 页面或路由。
- 不改变 LLM provider 配置模型。
- 不修改 ComfyUI 生成链路。
- 不改变 Canvas Chat 会话列表、消息流、Apply 时序或布局质量弹窗的既有行为。
- 不引入外部 UI 组件库。

## 当前代码背景

| 文件 | 当前职责 | 本次影响 |
| --- | --- | --- |
| `src/types/chat.ts` | 定义 `ChatMessage`、`CanvasChatSession`、`CanvasChatRequestLog` 和步骤类型 | 扩展 request log 详情字段和详情类型 |
| `src/store/index.ts` | Zustand 单一状态源，保存 Canvas Chat session/request log，并持久化到本地 | 增加写入/更新请求详情的 action，确保旧日志兼容 |
| `src/services/workspace-persistence.ts` | 加载和清洗持久化 Canvas Chat 会话 | 清洗新增日志详情字段，旧数据缺字段时安全降级 |
| `src/hooks/useCanvasChat.ts` | 构建上下文、发送 LLM 请求、处理流式响应、解析 Ideogram JSON | 在发送前后写入完整请求、响应、解析结果和错误详情 |
| `src/components/canvas/CanvasChatPanel.tsx` | Canvas Chat 普通态、最大化工作台、右侧 Terminal | 增加步骤详情入口和模态详情弹窗；调整目标尺寸控件结构 |
| `src/components/chat/ChatRunControls.tsx` | 共享 Stream 开关和思考级别滑块 | 作为目标尺寸滑块视觉与交互参考，不改变其行为 |
| `src/index.css` | 全局样式和 Canvas Chat 工作台样式 | 增加日志详情、可复制代码块、紧凑尺寸滑块样式 |
| `src/i18n/translations.ts` | 中英 UI 文案 | 增加详情标题、复制、请求、响应、错误等文案 |

## 日志数据设计

### 类型草案

```typescript
interface CanvasChatRequestLog {
  id: string;
  sessionId: string;
  promptPreview: string;
  status: 'running' | 'success' | 'error';
  startedAt: number;
  endedAt?: number;
  steps: CanvasChatRequestLogStep[];
  detail?: CanvasChatRequestLogDetail;
}

interface CanvasChatRequestLogDetail {
  metadata?: {
    providerId: string;
    providerName: string;
    modelName: string;
    responseLang: string;
    streamEnabled: boolean;
    thinkingLevel: ChatThinkingLevel;
    targetSize: number;
    canvasSize: { width: number; height: number };
    boxCount: number;
  };
  systemPrompt?: string;
  messages?: ChatMessageForApi[];
  responseText?: string;
  parsedJsonText?: string;
  parseError?: string;
}
```

设计约束：

- `systemPrompt` 保存最终发送给服务层的完整 system prompt，包含语言偏好。
- `messages` 保存最终发送给服务层的 messages，而不是用户输入原文。最后一条用户消息应包含 target size hint、当前画布 context JSON 和用户请求。
- `responseText` 保存模型完整原始返回。流式与非流式都在请求结束后写入完整文本。
- `parsedJsonText` 保存从 `responseText` 中提取出的 JSON 代码块文本。解析失败但能提取 JSON 代码块时也应记录，方便定位字段错误。
- `parseError` 保存和终端步骤一致的明确失败原因。
- 日志详情允许缺字段，以兼容旧 localStorage 数据和中途刷新导致的未完成请求。

### Store action

新增一个面向详情的 action：

```typescript
updateCanvasChatRequestDetail(
  requestId: string,
  updates: Partial<CanvasChatRequestLogDetail>,
): void;
```

使用合并更新方式，避免 `useCanvasChat` 在不同阶段需要一次性拿到所有详情：

1. provider/model 校验通过后写入 `metadata`。
2. 构建 `apiMessages` 与 system prompt 后写入 `systemPrompt` 和 `messages`。
3. stream 完成后写入 `responseText`。
4. JSON 提取或解析后写入 `parsedJsonText` 与 `parseError`。

持久化策略：

- 跟随现有 Canvas Chat session 持久化。
- 不截断用户可见的调试详情，满足“完整显示请求提示词以及返回提示词”的需求。
- 不记录每个 chunk，控制体积。
- `workspace-persistence` 清洗时对字符串和数组做类型校验；异常字段丢弃，不影响会话加载。

## 发送流程

`useCanvasChat.sendMessage()` 的关键写入点：

1. `startCanvasChatRequest(content.slice(0, 80))` 创建运行中请求。
2. 截图、上下文构建、provider/model 校验继续按现有步骤写入 `steps`。
3. provider/model 校验通过后写入 `metadata`，包含 provider、model、语言、stream、thinking、目标尺寸、当前画布尺寸和 box 数量。
4. 构建 `contextJson`、`apiMessages` 和 `CANVAS_CHAT_SYSTEM_PROMPT + langHint` 后，写入完整 `systemPrompt` 与最终 `messages`。
5. `onDone` 中写入完整 `responseText`。
6. 调用 JSON 提取和结构校验：
   - 能提取 JSON 代码块时写入 `parsedJsonText`。
   - 解析成功时记录 `parse_success`，请求可完成为 success。
   - 解析失败时写入 `parseError`，记录 `parse_failed` 与最终 error。
7. `onError` 中写入 `parseError` 或网络错误文本，并结束请求。

错误可见性要求：

- 解析失败时，详情里必须同时能看到原始返回和错误原因。
- 缺少 JSON 代码块时，`responseText` 仍必须完整保存。
- provider/model 缺失时，详情至少保留用户请求预览和错误步骤；没有发送给模型的 payload 时，详情视图显示“请求尚未发送”。

## 终端交互设计

### 右侧 Terminal 默认视图

右侧 Terminal 继续展示当前请求的步骤列表：

- 顶部显示请求预览、状态和基础 metadata 摘要。
- 中部显示步骤列表：`snapshot`、`build_context`、`provider_ready`、`stream_start`、`stream_done`、`parse_success` 或 `parse_failed`。
- 关键步骤行显示“查看详情”按钮或整行可点击状态。
- 错误步骤保持红色状态，成功步骤使用 accent 色。

默认视图不直接展示完整 prompt，避免长文本挤压右栏布局。

### 详情弹窗

详情视图从步骤行打开，实现为 createPortal 到 `document.body` 的模态弹窗。弹窗信息结构保持一致：

1. `Metadata`
   - provider/model
   - stream 状态
   - thinking level
   - response language
   - target size
   - 当前 canvas size
   - box count
2. `Request`
   - `systemPrompt`
   - `messages`，按 role 分组展示
3. `Response`
   - 模型完整原始返回
4. `Parsed JSON`
   - 提取到的 JSON 代码块文本；没有时显示空态
5. `Error`
   - 解析错误、网络错误或 provider 错误；没有时显示成功摘要

每个长文本块要求：

- 使用 monospace。
- `white-space: pre-wrap`。
- `word-break: break-word`。
- 设置稳定最大高度和内部滚动。
- 提供复制按钮，复制对应块的完整文本。

键盘和关闭行为：

- `Escape` 关闭详情。
- 点击遮罩关闭详情。
- 复制失败时不弹阻塞式 `alert`，可显示短暂状态文案。
- 打开详情时不改变当前 Canvas Chat 会话或请求。

## 目标尺寸滑块设计

当前目标尺寸控件使用 `.canvas-chat-target-size-control` 的竖向结构，并额外展示 `1K / 2K / 4K` marks。优化后改为与思考级别滑块同一视觉模型：

```text
Size: 2K [---●---]
Think: Medium [---●---]
```

行为保持不变：

- 可选值仍为 `1024 / 2048 / 4096`。
- store 字段仍为 `canvasChatTargetSize`。
- 持久化 key 仍为 `ideogram4-canvas-chat-target-size`。
- 文案继续使用 `targetSizeShort`、`targetImageSize` 和 `targetSizeHint`。

样式要求：

- 高度、边框、背景、focus ring 与 `.chat-thinking-control` 对齐。
- slider 宽度与思考级别一致或接近，建议 `58px`。
- 不再显示独立 marks 行。
- 工具条在普通态和最大化态都不因尺寸控件换行而明显增高。

## 测试计划

### Store 测试

- `startCanvasChatRequest` 创建日志时 `detail` 可为空。
- `updateCanvasChatRequestDetail` 能按 requestId 合并写入 metadata、request、response 和 parse error。
- 旧 session 数据没有 `detail` 字段时仍能正常加载。
- 运行中请求刷新后仍会被标记为 error，并保留已有 detail。

### Hook 测试

- Canvas Chat 发送请求时记录完整 system prompt 和最终 messages。
- 成功响应时记录完整 `responseText` 和 `parsedJsonText`。
- 缺少 JSON 代码块时记录完整 `responseText` 与 parse error。
- JSON 字段结构错误时记录提取出的 JSON 文本与具体 parse error。
- provider/model 缺失时不会写入伪造的 request payload。

### 组件测试

- Terminal 步骤行能打开详情视图。
- 详情视图展示 metadata、Request、Response、Parsed JSON 和 Error 分区。
- 复制按钮使用对应分区的完整文本。
- `Escape` 和遮罩能关闭详情。
- 目标尺寸滑块显示为横向紧凑控件，并能切换到 `1K / 2K / 4K`。

### 手动验证

- 启动 `npm run dev`，进入 Canvas Chat 最大化态。
- 构造一次正常返回，确认 Terminal 步骤成功，详情里能看到完整请求和完整返回。
- 构造一次缺失 JSON 代码块的返回，确认错误详情展示原始返回。
- 构造一次 bbox 字段错误的返回，确认错误详情展示 JSON 片段和字段错误。
- 调整目标尺寸为 `1K / 2K / 4K`，确认请求中的 target size 与 UI 显示一致。

## 验收标准

- 用户在 Canvas Chat 报错后，不需要打开开发者工具，就能从 Terminal 详情看到完整最终请求和完整模型返回。
- JSON 解析失败时，错误原因和导致错误的原始返回同时可见。
- Terminal 默认视图仍保持步骤列表，不被长 prompt 挤满。
- 目标尺寸滑块视觉与思考级别滑块一致，普通态和最大化态工具条都保持稳定。
- 新增日志字段兼容旧本地会话数据，不导致页面加载失败。
- 相关 store、hook、组件测试通过。
