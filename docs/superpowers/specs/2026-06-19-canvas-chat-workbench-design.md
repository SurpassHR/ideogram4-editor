# Canvas Chat Workbench 优化设计

> 日期：2026-06-19 · 状态：设计已确认

## 概述

优化画布级 `CanvasChatPanel`，让它从底部小型对话抽屉扩展为可最大化的调试工作台。用户仍可用当前轻量面板进行快速对话；当需要查看多轮会话、请求过程或错误原因时，可点击右上角最大化按钮进入三栏工作台。

本次设计解决两个核心问题：

1. Canvas Chat 缺少展开空间，无法同时承载会话列表、长对话和诊断信息。
2. 当前自动硬重试会隐藏请求细节，用户难以判断失败发生在 provider、stream、JSON 解析还是布局校验阶段。

## 已确认决策

- 最大化态采用三栏工作台：左侧会话列表，中间聊天，右侧终端日志。
- 会话状态先保存在当前页面运行时，不做 `localStorage` 持久化；但数据结构按后续可持久化方式设计。
- 终端日志默认显示当前请求，提供历史请求切换或折叠入口。
- 取消 Canvas Chat 的自动硬重试；JSON 解析失败后停止当前请求并显示日志。
- 保留布局质量弹窗的手动“重新生成”，因为它是用户主动发起的新请求，不属于隐藏重试。

## 范围

### 本次范围

- 在 `CanvasChatPanel` header 右上角增加最大化按钮。
- 最大化后展示三栏工作台布局。
- 增加 Canvas Chat 会话列表，支持新建会话、切换会话和清空当前会话。
- 增加请求终端日志，按请求记录关键步骤、状态和错误详情。
- 将 `useCanvasChat.sendMessage()` 改为单次请求流程，移除自动硬重试循环。
- 更新相关 store、类型、组件测试和 hook/store 测试。

### 非本次范围

- 不实现会话 `localStorage` 持久化。
- 不修改 per-box `ChatPanel`。
- 不移除布局质量弹窗的手动“重新生成”能力。
- 不引入外部 UI 组件库。
- 不改变 LLM provider 配置模型。

## 当前代码背景

相关文件：

| 文件 | 当前职责 | 本次影响 |
| --- | --- | --- |
| `src/components/canvas/CanvasChatPanel.tsx` | 画布级对话抽屉、消息列表、输入区、Apply 确认 | 增加最大化态、三栏布局、会话列表和终端日志 |
| `src/hooks/useCanvasChat.ts` | provider/model 解析、发送、流式、JSON 解析、Apply、布局质量反馈 | 移除自动硬重试，写入请求日志，按活跃 session 读写消息 |
| `src/store/index.ts` | Zustand 单一状态源 | 新增 session 与 request log 状态和 actions |
| `src/types/chat.ts` | ChatMessage 类型 | 增加 Canvas Chat session / request log 类型或拆出新类型文件 |
| `src/components/canvas/LayoutQualityDialog.tsx` | 布局质量报告与手动重新生成 | 保持能力，确保新请求有独立 requestId 和日志 |
| `src/index.css` | 当前 Canvas Chat 样式 | 增加最大化工作台、会话列表和终端 panel 样式 |

## 信息架构

### 普通展开态

普通态继续作为底部 Canvas Chat 抽屉存在：

- 左侧标题：`Canvas AI Compose`
- 右上角按钮：最大化
- 主体：当前会话消息列表
- 底部：预设、模型、语言、输入框、发送按钮、Apply 按钮
- 可选状态入口：当当前请求失败或仍在运行时，显示小型状态摘要，点击后最大化并聚焦终端日志

普通态不展示完整会话列表，避免压缩现有轻量使用体验。

### 最大化态

最大化态覆盖 Artboard 内部工作区域，不随画板 zoom/pan 缩放。

三栏结构：

| 区域 | 宽度建议 | 内容 |
| --- | --- | --- |
| 左栏：会话列表 | 220-260px | 新建会话、会话标题、最近摘要、时间、状态 |
| 中栏：聊天 | 自适应主区域 | 消息、模型/语言/预设、输入、Apply |
| 右栏：终端日志 | 280-360px | 当前请求步骤、历史请求折叠、错误详情 |

响应式约束：

- 宽屏保持三栏。
- 较窄视口可将终端栏切为抽屉或底部 panel，但仍以 A 方案的信息结构为准。
- 文本必须可换行，按钮使用稳定尺寸，避免最大化态布局跳动。

## 会话模型

### 类型草案

```typescript
interface CanvasChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  pendingIdeogramOutput: IdeogramOutput | null;
  pendingQualityReport: LayoutQualityReport | null;
  requestLogs: CanvasChatRequestLog[];
}

interface CanvasChatRequestLog {
  id: string;
  sessionId: string;
  promptPreview: string;
  status: 'running' | 'success' | 'error';
  startedAt: number;
  endedAt?: number;
  steps: CanvasChatRequestLogStep[];
}

interface CanvasChatRequestLogStep {
  id: string;
  at: number;
  kind:
    | 'snapshot'
    | 'build_context'
    | 'provider_ready'
    | 'stream_start'
    | 'stream_chunk'
    | 'stream_done'
    | 'parse_success'
    | 'parse_failed'
    | 'layout_validation'
    | 'done'
    | 'error';
  status: 'pending' | 'running' | 'success' | 'error';
  label: string;
  detail?: string;
}
```

### Store 字段

新增或调整字段：

- `canvasChatSessions: CanvasChatSession[]`
- `activeCanvasChatSessionId: string`
- `activeCanvasChatRequestId: string | null`
- `isCanvasChatMaximized: boolean`

兼容策略：

- `messages` 在 hook 返回层从当前 session 派生，组件无需理解旧的 `canvasChatMessages` 单数组。
- 可保留 `canvasChatMessages` 作为过渡字段，但实现计划应优先收敛到 session 派生状态。
- 初始进入页面时自动创建一个默认会话，保证现有单会话体验不需要用户额外操作。

### Store actions

- `createCanvasChatSession(title?: string): string`
- `selectCanvasChatSession(sessionId: string): void`
- `renameCanvasChatSession(sessionId: string, title: string): void`
- `clearCanvasChatSession(sessionId: string): void`
- `addCanvasChatMessage(message: ChatMessage): void`
- `updateCanvasChatMessage(messageId, updates): void`
- `setPendingIdeogramOutput(output): void`
- `setPendingQualityReport(report): void`
- `startCanvasChatRequest(promptPreview): string`
- `appendCanvasChatRequestStep(requestId, step): void`
- `finishCanvasChatRequest(requestId, status, detail?): void`
- `setCanvasChatMaximized(maximized: boolean): void`

所有会话 action 只影响 Canvas Chat 状态，不影响 boxes、全局设置、ComfyUI 生成状态或 per-box chat history。

## 发送流程

`sendMessage(content, retryContext?)` 改为单次请求流程：

1. 创建 `requestId`，写入 `running` 请求日志。
2. 创建 user message，附上画布缩略图。
3. 记录 `snapshot` 步骤：成功、失败或跳过。
4. 构建当前 canvas context，记录 `build_context`。
5. 校验 provider 和 model，记录 `provider_ready`；若缺失则结束为 error。
6. 创建 assistant 占位消息。
7. 调用 `sendChatMessageStream()`，记录 `stream_start`。
8. 每次 content/thinking chunk 更新 assistant 占位消息；终端日志可节流更新 `stream_chunk`，避免每个 token 都刷一行。
9. stream 完成后记录 `stream_done`。
10. 调用 `extractAndValidateIdeogramJSON(finalContent)`。
11. 解析成功：写入 `pendingIdeogramOutput`，记录 `parse_success`。
12. 执行布局质量软校验，记录 `layout_validation`。
13. 请求结束：记录 `done`，request 状态为 `success`。
14. 解析失败：记录 `parse_failed` 和最终 `error`，保留 assistant 原文，不再自动重新请求。
15. 网络或 provider 错误：写入 assistant 错误内容，记录 `error`，request 状态为 `error`。

### 取消自动硬重试

移除现有逻辑：

```typescript
let hardRetryCount = 0;
const MAX_HARD_RETRIES = 2;

while (hardRetryCount <= MAX_HARD_RETRIES) {
  const success = await doStreamAttempt();
  if (success) return;
  hardRetryCount++;
}
```

新的行为：

- JSON 解析失败后立即停止。
- 不追加“解析失败，正在重新生成”的系统消息。
- 不将解析错误自动注入下一次请求。
- 用户可以手动继续对话，让模型修正格式。
- 布局质量弹窗的“重新生成”仍会调用 `sendMessage(lastUserMsg.content, { feedback })`，但它是新的显式请求，独立记录日志。

## 终端日志设计

### 默认视图

右栏终端默认展示当前请求：

- 顶部：请求标题、状态、耗时、模型
- 中部：步骤列表
- 底部：最终成功摘要或错误摘要

步骤行结构：

- 时间：`HH:mm:ss`
- 状态：running / success / error
- 阶段名：例如 `build_context`
- 简述：例如 `4 boxes, 1024x1024, 3 palette colors`

### 历史请求

历史请求入口位于终端顶部：

- `Current`：只看当前请求。
- `History`：按请求分组折叠展示。

历史请求分组显示：

- prompt preview
- startedAt
- status
- duration
- step count

展开后显示完整步骤和错误详情。

### 错误详情

错误步骤默认显示简短原因，展开后展示完整 detail：

- provider/model 缺失
- fetch/stream 错误
- JSON 代码块缺失
- JSON.parse 异常
- schema 字段缺失
- bbox 或 element 校验失败

终端日志是面向创作者和调试者的诊断信息，不替代聊天消息。聊天消息保留 AI 原文，终端解释系统流程。

## UI 交互细节

- 最大化按钮位于 `CanvasChatPanel` header 右上角。
- 最大化态右上角提供退出最大化按钮。
- `Escape` 行为：
  - 最大化态：先退出最大化。
  - 普通展开态：关闭面板。
- 点击画布空白关闭只作用于普通展开态；最大化态不因误点关闭。
- 切换会话时，中栏消息、pending output、质量报告和终端日志都跟随会话切换。
- 新建会话后自动选中新会话，并清空输入框。
- 会话标题默认取首条用户消息前 24 个字符；没有消息时显示“新会话”。
- Apply 按钮作用于当前会话的 `pendingIdeogramOutput`。

## 错误处理

| 场景 | 用户可见行为 | 终端日志 |
| --- | --- | --- |
| 无 provider | 聊天区显示配置提示或错误消息 | `provider_ready` 为 error |
| 无 model | 聊天区显示错误消息 | `provider_ready` 为 error |
| 画布截图失败 | 请求继续执行 | `snapshot` 为 error 或 skipped |
| SSE stream 错误 | assistant 占位消息追加错误 | `stream_start` 或 `stream_chunk` 为 error |
| JSON 解析失败 | 保留 AI 原文，不显示 Apply | `parse_failed` + `error` |
| 布局质量未通过 | 显示 `LayoutQualityDialog` | `layout_validation` 为 success，detail 记录未通过指标 |
| 用户主动重新生成 | 新建 request log | 新 requestId 独立记录 |

## 测试策略

### Store 测试

- 初始状态自动拥有一个 Canvas Chat session。
- 新建会话后 active id 切换到新会话。
- 切换会话后消息、pending output、request logs 互不污染。
- 清空当前会话只清空当前 session，不影响 boxes 和全局设置。
- 追加、更新 request log step 能正确更新对应 request。
- request 完成后写入 `endedAt` 和最终 status。

### Hook 测试

- `sendMessage()` 成功流式返回并解析 JSON，写入 `pendingIdeogramOutput`。
- JSON 解析失败时只请求一次，不触发第二次 stream。
- JSON 解析失败时写入 `parse_failed` 和 request `error`。
- provider/model 缺失时不调用 stream，并写入错误日志。
- stream 错误时更新 assistant 错误内容和 request `error`。
- 布局质量未通过时写入 `pendingQualityReport`，且记录 `layout_validation`。
- 用户主动重新生成时创建新的 requestId。

### 组件测试

- 普通态 header 显示最大化按钮。
- 点击最大化进入三栏布局。
- 会话列表显示当前 session 和新建按钮。
- 切换会话后中栏消息跟随变化。
- 终端 panel 默认显示当前 request。
- 历史 request 可折叠展开。
- `Escape` 在最大化态只退出最大化。
- 无 provider 状态仍能进入最大化态查看配置提示。

### 视觉验证

启动本地 dev server 后检查：

- 普通展开态不遮挡画布主要操作。
- 最大化三栏在桌面宽度下不溢出。
- 会话列表长标题能截断或换行。
- 终端错误详情展开后不挤压输入区。
- 切换普通态和最大化态时没有明显布局跳动。

## 实施顺序建议

1. 增加类型和 store session/request log 状态，先保持 UI 不变。
2. 改造 `useCanvasChat`，让消息、pending output、quality report 从 active session 读写。
3. 移除自动硬重试循环，接入 request log。
4. 增加普通态最大化按钮和最大化状态。
5. 实现三栏工作台 UI。
6. 补齐 store、hook、组件测试。
7. 做桌面视觉验证和一次真实/模拟 stream 错误验证。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 现有 `canvasChatMessages` 迁移影响旧测试 | 先在 hook 层保持 `messages` 返回形状，逐步收敛 store 字段 |
| request log 过度频繁更新导致渲染抖动 | 对 `stream_chunk` 日志节流，只保留累计 token 数或阶段状态 |
| 最大化态与 Artboard 点击关闭逻辑冲突 | 最大化态禁用空白点击关闭，只允许按钮和 Escape 退出 |
| 会话切换时 pending output 混乱 | pending output 和 quality report 归属 session，不用全局单例 |
| 终端日志暴露过多原始错误 | 默认展示摘要，完整 detail 只在展开时显示 |

## 成功标准

- 用户能在普通态一键最大化 Canvas Chat。
- 最大化态同时清楚展示会话列表、聊天内容和终端日志。
- 每次请求都能看到从截图、上下文构建、provider、stream、解析到质量校验的关键步骤。
- JSON 解析失败不会自动重试，终端能显示明确失败阶段和原因。
- 现有 Canvas Chat 的发送、流式显示、Apply、布局质量弹窗仍可正常使用。
- per-box ChatPanel 行为不受影响。
