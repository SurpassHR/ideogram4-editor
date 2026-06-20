# Canvas Chat Panel 优化设计

- **日期**: 2026-06-19
- **状态**: Draft
- **范围**: `CanvasChatPanel` 画布级 AI 构图对话面板的重构

## 1. 背景与目标

当前 `CanvasChatPanel`（`src/components/canvas/CanvasChatPanel.tsx`）是停靠在画板底部的浮动条，存在三类问题：

1. **无会话概念** —— 单一扁平 `canvasChatMessages[]` 数组，刷新即丢，无法管理多个构图方向。
2. **黑箱式重试** —— `useCanvasChat.sendMessage` 内部对解析/流式错误自动重试（`MAX_HARD_RETRIES=2`，`while hardRetryCount <= MAX_HARD_RETRIES`，共 3 次尝试），用户只看到消息里内联的 `[Parse Error]` 文本，看不到中间过程，也无法手动干预。
3. **无错误可见性** —— 只有单一 `isLoading` 布尔，无阶段化状态，错误以文本内联到消息。无任何终端/调试面板。

本次重构两大目标：

- **A. 展开/最大化 + 持久化多会话**：右上角按钮全屏覆盖式展开，三栏布局（会话列表 / 消息区 / 终端）；会话持久化到 localStorage。
- **B. 取消重试 + 终端 panel**：移除自动重试循环，改为请求进行中可手动取消、失败可手动重发；新增终端 panel 中粒度展示请求全过程。

## 2. 关键决策汇总

| 决策点 | 选择 |
|---|---|
| 最大化布局 | 三栏常驻（会话列表 \| 消息区 \| 终端），全屏覆盖式 portal |
| 收起态 | 单行状态条（当前请求阶段），点击展开 |
| 会话模型 | 持久化多会话（列表 + 消息历史），终端日志不持久化 |
| 会话-画布关系 | 纯对话历史，不绑定画布；pending 产物按会话隔离 |
| 会话标题 | 请求成功后 LLM 摘要生成，失败 fallback 首条用户消息前 20 字 |
| 标题模型 | 独立轻量模型配置（设置页新增项，默认快模型） |
| 切换会话 | 不取消进行中请求，后台续跑（每会话独立 loading + AbortController） |
| 取消重试 | 移除自动重试循环 + 请求进行中可手动取消 |
| 终端粒度 | 中粒度，全部阶段 + token/行计数 + 可折叠详情 |
| 重发按钮 | 挂在用户消息气泡上 |
| 重发语义 | R1 重新拍快照（原文本 + 当前画布） |
| Esc 语义 | 最大化态 Esc 先收起到 dock，再按 Esc 关闭面板 |

## 3. 架构总览

### 3.1 Store 数据模型（混合模型）

采用**混合模型**：持久化部分为对象数组（顺序结构化），临时部分为 `Record<sessionId, SessionRuntime>`（热更新廉价 + 物理隔离"不持久化终端"）。

```ts
// PERSISTED（localStorage，序列化）—— 数组
interface CanvasChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];      // 含 canvasSnapshotUrl（data URL 字符串）
  createdAt: number;
  updatedAt: number;
}

// EPHEMERAL（内存，绝不序列化）—— Record<sessionId, ...>
interface SessionRuntime {
  loading: boolean;
  currentPhase: TerminalPhaseId | null;   // 驱动收起态状态条
  pendingIdeogramOutput: IdeogramOutput | null;
  pendingQualityReport: LayoutQualityReport | null;
  terminalLog: TerminalEntry[];           // 仅内存
}
```

Store 新增字段：
- `canvasChatSessions: CanvasChatSession[]`（持久化）
- `activeCanvasChatSessionId: string | null`（持久化）
- `sessionRuntime: Record<string, SessionRuntime>`（临时）
- `isCanvasChatMaximized: boolean`（临时 UI 标志）

**AbortController 不进 store** —— 用模块级 `Map<string, AbortController>`（`useCanvasChat.ts` 内），键为 sessionId。与现有 `internalClipboard`（store 内模块级变量）模式一致。原因：Zustand state 须可序列化，控制器放入是已知 footgun；控制器与在途请求 1:1，请求生命周期由 hook 拥有，store 只需 `loading` 布尔供渲染。

**选择混合模型而非纯数组/纯归一化 map 的理由**：store 已混用持久化数组（`chatPresets` + 手动 `savePresetsToStorage`）与非持久化 Record（`chatHistories`），混合模型复用两条既有模式。数组保序简单，临时 map 让热更新（流式 token / 终端追加）廉价，并**结构性强制**"终端不持久化"（物理隔离而非约定）。归一化 map + order 数组方案需同步两处真值，收益不抵成本。

### 3.2 localStorage 持久化机制

沿用 `chatPresets` 既有模式：
- `loadCanvasChatSessionsFromStorage()` 启动时读 `ideogram4-canvas-chat-sessions`；空则 seed 一个默认会话。
- `saveCanvasChatSessionsToStorage(sessions)` 在每个变更 action 后写。
- **序列化**：仅 `id, title, messages, createdAt, updatedAt`。
- **不序列化**：`sessionRuntime`、AbortController、`isCanvasChatMaximized`。
- **体积控制**：`canvasSnapshotUrl`（每条 ~2-4KB JPEG）是膨胀风险。限制每会话最近 50 条消息（保留 user/assistant 配对）；持久化时剥离 6 条以前消息的 `canvasSnapshotUrl`。`setItem` 包 try/catch，遇 `QuotaExceededError` 丢最旧会话 snapshot 数据后重试一次。

### 3.3 向后兼容 shim（过渡期）

保留旧字段 `canvasChatMessages`、`pendingIdeogramOutput`、`pendingQualityReport`、`isCanvasChatLoading` 及对应 action 作为**读写穿透 shim**，指向当前激活会话的 runtime/messages。使 `Artboard`、`LayoutQualityDialog`、现有测试在 PR 1 零改动通过。PR 2 迁移 reader，PR 3 删除 shim。

测试影响：`CanvasChatPanel.test.tsx` 中 `setState({ pendingIdeogramOutput })` 经 shim 写入激活（seed 默认）会话，保持通过。

### 3.4 迁移

`canvasChatMessages` 从未持久化，故**无需数据迁移**。首次加载 `loadCanvasChatSessionsFromStorage` 找不到 key → seed 一个空默认会话 `{ id: 'sess_default', title: '新对话', ... }`，用户看到与今天一致的空对话。部署时正在对话的用户丢失（本就不持久化的）历史 —— 与每次刷新现状一致。

## 4. 终端 instrumentation

### 4.1 阶段清单（14 主阶段 + 2 失败/可选分支）

下表为 `TerminalPhaseId` 的真值来源。1-12 为正常路径主阶段，13-14 为失败分支，15-16 为新增（取消 / 标题生成）。

| # | 阶段 ID | 位置 |
|---|---|---|
| 1 | `snapshot_canvas` | `takeCanvasSnapshot()` |
| 2 | `resolve_provider` | `getCurrentProvider()`/`parseModel` |
| 3 | `build_context` | `buildCanvasChatContext(snapshot)` |
| 4 | `build_messages` | 组装 apiMessages + 富化末条 user msg |
| 5 | `open_connection` | provider streamer 内 `fetch()` |
| 6 | `stream_thinking` | 首个 thinking chunk |
| 7 | `stream_content` | content chunks（**实时 token/行计数**） |
| 8 | `stream_done` | `onDone` 触发 |
| 9 | `extract_json` | `extractAndValidateIdeogramJSON` |
| 10 | `normalize_bbox` | bbox 系统检测 + 归一化到 0-1000 |
| 11 | `validate_layout` | `validateLayout` |
| 12 | `set_pending_output` | `setPendingIdeogramOutput` + `setPendingQualityReport` |
| 13 | `parse_error`（失败分支） | `buildParseErrorText` |
| 14 | `stream_error`（失败分支） | `onError` |
| 15 | `cancelled`（新） | abort 路径 |
| 16 | `title_generated`（新，可选） | 标题 LLM 调用 |

### 4.2 接入策略：TerminalEmitter 注入

采用**注入式 emitter**（方案 a），而非包装 `sendChatMessageStream`（方案 b）或裸 inline 调用（方案 c）。

定义 `TerminalEmitter` 接口：`{ start(phase, detail?), progress(phase, detail), end(phase, status, detail?) }`。`useCanvasChat` 在请求开始时为该会话创建一个 emitter（绑定 sessionId），每个阶段边界调 `emitter.start/end`，经 store action `appendTerminalEntry` 写入 `sessionRuntime[sessionId].terminalLog`。

理由：阶段边界本就在 `useCanvasChat` 业务逻辑里，无需在 hook 与 streamer 间加抽象层。token/行计数免费获得 —— `onChunk` 已逐 token 运行，`emitter.progress('stream_content', {tokens, lines})` 一行。`llm-stream.ts` 除 signal 参数（见 §5）外不动。emitter 的 ~30 行换来 `performance.now()` 的耗时追踪（需求要求 entry 含 duration），值得。

### 4.3 TerminalEntry 模型

```ts
type TerminalPhaseStatus = 'running' | 'ok' | 'error' | 'cancelled';

interface TerminalEntry {
  id: string;
  phase: TerminalPhaseId;
  status: TerminalPhaseStatus;
  ts: number;
  durationMs?: number;        // end/ok/error 时填
  detail?: string;            // 可折叠的人读负载
  tokens?: number;            // 仅 stream_content，累计
  lines?: number;             // 仅 stream_content，累计
}
```

### 4.4 流式 token/行计数（廉价）

`onChunk` 闭包内维护 `tokenCount`、`lineCount`。token：按空白拆分累计内容近似（开发辅助，非计费）。行：计 `\n`。**节流** `emitter.progress` 至每 ~250ms 一次（时间戳门控），避免逐 token 写 store 导致终端面板逐 token 重渲染。这是唯一关键性能细节。

收起态状态条读 `sessionRuntime[activeId].currentPhase` + 最新 `stream_content` entry 的 `tokens`/`lines`，单一 selector，按 250ms 节奏重渲染。

## 5. 取消 + 重发机制

### 5.1 AbortController 位置

模块级 `Map<string, AbortController>`（`useCanvasChat.ts`，键 sessionId —— 每会话至多一个在途请求）。`sendMessage` 开始时创建，`onDone`/`onError`/cancel 时删除。

### 5.2 `llm-stream.ts` 必要改动

`sendChatMessageStream` 新增可选参数 `externalSignal?: AbortSignal`。内部若提供则监听其 `abort` 事件并调内部 `controller.abort()`。保留既有 30s 超时控制器。~5 行，向后兼容（参数可选），per-box chat 调用点不受影响。**这是对 `llm-stream.ts` 唯一不可避免的改动。**

### 5.3 取消流程

`useCanvasChat.cancelRequest(sessionId)`：
1. `controllers.get(sessionId)?.abort()` → streamer 触发 `onError`（AbortError）。
2. `onError` 内区分取消与真错误：检查 `signal.aborted`，若已 abort 则**不**追加 `[Stream Error]`，而是用已累计内容定稿 placeholder（保留部分进度可见），追加 `[已取消]` 标记，emit `cancelled` 阶段 + 终端行「已取消」。
3. `sessionRuntime[sessionId].loading = false`，删除 controller 条目。
4. 标记发起该请求的**用户**消息 `cancelled: true`（见下）。

### 5.4 ChatMessage 扩展

`ChatMessage` 新增可选字段：

```ts
/** 用户消息：其请求被取消/失败，可重跑 */
cancelled?: boolean;
```

重发按钮在 `message.role === 'user' && message.cancelled === true` 时渲染于**用户**气泡。

### 5.5 重发语义（R1：重新拍快照）

`useCanvasChat.resend(sessionId, userMessageId)`：找到该用户消息，读其 `content`，对该会话调 `sendMessage(content, { sessionId })`（`sendMessage` 现需接受 `sessionId` 参数）。清 `cancelled` 标记。内部自动重试循环**已移除**，故重发为单次尝试，失败则再挂重发。

**R1 理由**：需求"同样输入"= 用户文本。画布全局唯一且明确不绑会话，故每条失败消息冻结画布快照与"画布全局"模型矛盾，且会让预览与所见不符。重发 = 当前画布重新拍快照 + 原文本。亦最轻量（无每消息负载），并与现有 `handleRegenerate`（已复用 `lastUserMsg.content` 并重建上下文）语义一致。一致性优于冻结状态保真。

终端详情行（`build_context` 阶段）所需上下文 JSON 在发送时瞬态捕获进 terminal entry 的 `detail`（截断），已在闭包内存，无需持久化。

## 6. 组件分解

`CanvasChatPanel.tsx`（现 372 行）会膨胀，拆分：

```
CanvasChatPanel（编排 —— 保留 docked wrapper、refs、开关、Esc、外部点击）
├── CollapsedStatusStrip      （新 —— 单行阶段指示，点击 → 最大化）
├── DockedChatBar             （复用 —— 现面板体：header/messages/toolbar/input/Apply）
│   └── MessageArea           （新 —— 抽取：滚动容器 + ChatMessage 列表 + loading）
└── MaximizedOverlay          （新 —— createPortal→body，三栏 grid）
    ├── SessionListSidebar    （新 —— 列表/新建/删除/内联重命名/激活高亮）
    ├── MessageArea           （复用 —— 同组件，驱动激活会话）
    ├── TerminalPanel         （新 —— 可折叠阶段行，按激活会话）
    └── MaximizedHeader       （新 —— 标题/收起按钮/model/lang 选择器移此）
```

### 6.1 最大化 overlay 用 portal

`createPortal(..., document.body)` —— 匹配仓库所有既有 modal（`ChatPanel`、`ShortcutsModal`、面板自身 Apply-confirm）。本特性特有原因：docked 面板在 artboard 的变换/缩放容器内（Artboard 施加 `transform: translate+scale`），内联全屏 overlay 会继承该 transform 导致 `position: fixed` 失效。portal 到 body 逃逸之。overlay 用 `position: fixed; inset: 0; z-index`。Esc 收起（非关闭）—— overlay 的 Esc handler 调 `setIsCanvasChatMaximized(false)` 并 stopPropagation，避免同时触发 docked 面板 Esc-close。docked 面板 Esc handler 须门控于 `!isCanvasChatMaximized`。

### 6.2 Esc 语义

最大化态：Esc → 收起到 dock（不关面板）。再 Esc → 关面板。两次 Esc 从最大化到全关。

### 6.3 关键不变量：闭包捕获 sessionId

`onChunk`（现 `updateCanvasChatMessage(placeholderId, ...)`）改为 `updateSessionMessage(sessionId, placeholderId, ...)`，须用**请求开始时捕获的 sessionId**，而非当前激活会话。emitter、controller、所有 store mutation 在请求闭包内一律用捕获的 sessionId。切换会话时旧会话请求继续写入其 runtime/terminal，UI 显示新会话 —— 这在混合模型下**免费**成立（每会话独立 runtime + controller map），是混合模型最强论据。

### 6.4 修复 Artboard 双调用 useCanvasChat

`Artboard.tsx:16` `const { handleRegenerate } = useCanvasChat();` 仅为取一个函数却实例化整个 hook。采用 **`CanvasChatProvider` context**（方案 D2）：新建 `src/hooks/CanvasChatContext.tsx`，`CanvasChatProvider` 调一次 `useCanvasChat`，`useCanvasChatContext()` 消费。包裹 artboard 子树。单实例 → 单 provider-fetch effect → 单 controller map → 取消无论从哪个组件发起都生效。

不选 D4（双调用 + memoize），因其破坏每会话 controller 不变量（两实例各持其 map）。D1（lift 到 Artboard）可行但污染 Artboard props。D2 是干净边界，仓库已用 context（`I18nProvider`），习惯一致。

`LayoutQualityDialog` 的 Regenerate 语义不变：`onRegenerate={handleRegenerate}`（从 context），内部读激活会话 `pendingQualityReport` 调 `sendMessage` 带反馈。

## 7. 标题生成

### 7.1 位置与时机

`useCanvasChat` 内，`onDone` 成功路径（`setPendingIdeogramOutput` 后）**fire-and-forget** `void generateSessionTitle(...)`，**绝不 await**。主流程立即 resolve(true) 返回，标题生成并发。

### 7.2 模型/提示

用**独立轻量模型配置**（设置页新增项，默认快模型如 haiku 类）。复用 `sendChatMessage`（非流式，`llm-chat.ts`，已有超时 + provider 分发 + 返回 `{ok, content, error}`）。提示：

```
System: You title chat conversations. Reply with ONLY a title, max 16 chars, no quotes, no punctuation at the end. Use the user's language.
User: Summarize this request in a short title: "<首条用户消息>"
```

输入用**会话首条用户消息**（标题描述会话主题）。

### 7.3 失败 fallback 与并发

- `!ok` 或空/超长 → `title = firstUserMessage.content.slice(0, 20).trim()`。
- 全程 try/catch，标题失败绝不上报用户（无 toast、无终端 error，至多 `title_generated` entry 标 error + fallback 注记）。
- `updateSessionTitle(sessionId, title)` 用闭包捕获的 sessionId，用户切会话也落对会话。
- 会话在标题 resolve 前被删 → action 内 guard no-op。
- 标题走非流式路径 + 自有 30s 超时，**不触碰**会话 AbortController（那是主流式的）。取消主流式不取消标题（标题 gated 在成功路径，主请求取消则不触发）。
- 每会话仅生成一次（guard: `session.title === DEFAULT_TITLE`）。

## 8. 错误处理

- **取消**：§5.3，定稿 placeholder + `[已取消]` + 终端 `cancelled` 阶段。
- **解析失败**：移除自动重试，立即停。终端 `extract_json`/`parse_error` 标 error，detail 含 `buildParseErrorText` 的结构化诊断。用户气泡标 `cancelled: true` 挂重发。
- **流式错误**：`onError` 标 `stream_error`，detail 含错误原文。同上挂重发。
- **标题失败**：§7.3 fallback，静默。
- **localStorage 配额**：§3.2 try/catch 剥离旧 snapshot 重试。
- **无 provider/model**：现有早返回逻辑保留，终端 `resolve_provider` 标 error。

## 9. 测试策略

沿用 Vitest + @testing-library/react。

**既有测试零改动过 PR 1**（经 shim）：
- `CanvasChatPanel.test.tsx`：`setState({ pendingIdeogramOutput })` 经 shim 通过。
- `LayoutQualityDialog.test.tsx`：纯组件，不受影响。

**新增测试**：
- 会话 create/switch/delete 持久化（localStorage 读写）。
- 取消流程：abort → placeholder 定稿 + 终端 `cancelled` + 用户气泡 `cancelled: true`。
- 重发：读原 content + 新快照 + 单次尝试。
- 终端 entry 追加 + 节流（250ms 内多次 progress 合并）。
- 闭包 sessionId 不变量：切换会话后旧会话 onChunk 仍写旧会话。
- 标题生成成功/fallback/会话已删 no-op。
- 最大化 Esc 两次语义。
- `CanvasChatProvider` 单实例（provider-fetch effect 仅一次）。

## 10. 实施顺序（PR 计划）

1. **PR 1 — Store 模型 + shim**：会话数组 + runtime map + controller-map 模块 + load/save + seed 默认 + 会话 action + 旧字段 shim。无 UI 改动，既有测试全过。
2. **PR 2 — `llm-stream.ts` signal + 移除重试循环**：加 `externalSignal?`；删 `sendMessage` 内 `while` 重试（单次）；加取消 + 重发 + 重发按钮。
3. **PR 3 — 终端 instrumentation**：`TerminalEmitter` + 16 阶段点（见 §4.1）+ `TerminalEntry` 模型 + `appendTerminalEntry` + 节流 token/行计数 + `CollapsedStatusStrip` + `TerminalPanel`。
4. **PR 4 — 最大化 overlay + 会话列表 + MessageArea 抽取**：抽 MessageArea，建 MaximizedOverlay（portal 三栏）、SessionListSidebar，接 toggle + Esc 门控。
5. **PR 5 — 标题生成 + CanvasChatProvider + Artboard 双调用修复**：非阻塞标题 LLM + fallback + 独立轻量模型配置；lift hook 到 context；迁移 Artboard/LayoutQualityDialog/测试脱离 shim。
6. **PR 6 — 删除 deprecated shim**。

每 PR 独立可发布可测。

## 11. 关键文件

- `/media/hr/Data/Codes/ideogram4-editor/src/hooks/useCanvasChat.ts`
- `/media/hr/Data/Codes/ideogram4-editor/src/store/index.ts`
- `/media/hr/Data/Codes/ideogram4-editor/src/services/llm-stream.ts`
- `/media/hr/Data/Codes/ideogram4-editor/src/components/canvas/CanvasChatPanel.tsx`
- `/media/hr/Data/Codes/ideogram4-editor/src/types/chat.ts`
- 新增：`src/hooks/CanvasChatContext.tsx`、`src/components/canvas/MaximizedOverlay.tsx`、`src/components/canvas/SessionListSidebar.tsx`、`src/components/canvas/TerminalPanel.tsx`、`src/components/canvas/MessageArea.tsx`、`src/components/canvas/CollapsedStatusStrip.tsx`
