# Workspace 持久化与 Gist 备份设计

> 日期：2026-06-20 · 状态：设计已确认

## 概述

本次设计为 Ideogram JSON Prompt 可视化编辑器增加三类能力：

1. Canvas Chat Panel 的会话记录持久化到 `localStorage`，刷新页面后恢复上次对话、pending JSON、质量报告与请求日志。
2. 增加“收藏当前画布”功能，将当前画布保存为轻量快照，后续可恢复到画布继续编辑。
3. 在 Settings 页增加 Workspace Backup 区域，使用 GitHub private Gist 作为固定云备份目标，支持完整备份与恢复前预览选择覆盖模块。

目标是让创作过程不再依赖单次页面生命周期，同时给用户一个可迁移、可恢复的工作区备份机制。

## 已确认决策

- 采用显式领域持久化层，不直接把 Zustand store 整包写入 `localStorage`。
- Canvas Chat 会话持久化包含 messages、pending output、pending quality report、request logs。
- 画布收藏采用轻量快照，不保存 `imageDataUrl`、画布背景图 Data URL 或其他大体积图片数据。
- Gist 备份纳入本次实现范围。
- GitHub Personal Access Token 在 Settings 页填写，并保存到 `localStorage`。
- Gist 备份采用固定 private Gist：首次备份创建，后续覆盖更新同一个 Gist。
- Workspace 备份包含全工作区数据：当前画布、Canvas Chat 会话、画布收藏、聊天预设、LLM provider 配置、UI 偏好。
- LLM provider 配置备份包含 API key。
- 从 Gist 恢复时先进入预览，不直接覆盖本地；用户选择要覆盖的模块后再应用。
- 恢复预览支持按模块覆盖：当前画布、Canvas Chat 会话、画布收藏、聊天预设、LLM provider、UI 偏好。

## 范围

### 本次范围

- 增加 Canvas Chat session 的 `localStorage` load/save/validate。
- 增加画布收藏类型、store actions、本地持久化与 UI 入口。
- 在 Settings 页新增 Workspace 区域，承载收藏列表与 Gist 备份设置。
- 增加 workspace backup 服务，负责组包、解析、schema 校验与模块恢复。
- 增加 gist service，负责创建 private Gist、更新固定 Gist、拉取备份文件。
- 支持保存 GitHub PAT、固定 Gist ID、最后备份时间、最后恢复时间。
- 恢复前展示模块预览与覆盖选择。
- 补充 store、service、组件测试。

### 非本次范围

- 不实现端到端加密。
- 不实现 GitHub OAuth 授权流程。
- 不实现自动定时备份。
- 不实现多 Gist 版本历史浏览。
- 不保存画布或 box 的图片 Data URL 到画布收藏。
- 不改变当前 ComfyUI 生成流程。
- 不引入外部 UI 组件库。

## 安全边界

Private Gist 不是加密保险箱。备份包含 API key 时，风险来源包括 GitHub 账号被盗、浏览器本地存储泄露、恶意浏览器扩展、设备同步环境泄露、错误分享 Gist 链接等。

因此 UI 需要常驻提示：

- GitHub PAT 会保存到本机 `localStorage`。
- Workspace 备份会包含 LLM provider API key。
- Private Gist 依赖 GitHub 账号安全，不提供端到端加密。

本次设计按用户确认的完整备份策略实现，不做二次弹窗打断，但不得在文案中暗示“private Gist 等于绝对安全”。

## 当前代码背景

| 文件 | 当前职责 | 本次影响 |
| --- | --- | --- |
| `src/store/index.ts` | Zustand 单一状态源，包含 boxes、Canvas Chat sessions、chat presets、UI 状态 | 增加显式持久化辅助、favorites、backup settings 与恢复 actions |
| `src/types/chat.ts` | ChatMessage、CanvasChatSession、CanvasChatRequestLog 类型 | 保持 session 结构，补充可持久化约束 |
| `src/components/canvas/CanvasChatPanel.tsx` | Canvas Chat 普通态、最大化工作台、会话列表、请求日志 | session actions 自动触发持久化；可增加收藏入口或跳转 Settings |
| `src/components/layout/SettingsPage.tsx` | LLM provider 管理与提示词预设管理 | 增加 Workspace 区域：收藏列表、备份设置、恢复预览 |
| `src/components/llm/api.ts` | LLM provider CRUD 与 localStorage 持久化 | Workspace backup 读取/写入 provider 配置，包含 API key |
| `src/types/presets.ts` | Prompt preset 类型与持久化 key | Workspace backup 读取/恢复 chat presets |
| `src/utils/json-serializer.ts` | Ideogram JSON 生成与解析 | 复用为轻量画布快照的核心结构 |
| `src/i18n/translations.ts` | 中英 UI 文案 | 增加 Workspace、Favorites、Backup、Restore 文案 |
| `src/index.css` | 全局样式与面板样式 | 增加 Workspace 设置区、收藏列表、恢复预览样式 |

上一版 `CanvasChatSession` 已经按“后续可直接持久化”设计，本次会补齐实际持久化层。

## 数据模型

### Canvas Chat 持久化

持久化 key：

- `ideogram4-canvas-chat-sessions:v1`

建议结构：

```typescript
interface PersistedCanvasChatStateV1 {
  schemaVersion: 1;
  activeSessionId: string;
  sessions: CanvasChatSession[];
  savedAt: number;
}
```

加载规则：

- schema 缺失、JSON 解析失败、sessions 非数组或为空时，回退到一个空会话。
- 单个 session 损坏时跳过该 session；全部损坏时创建空会话。
- 加载后 `canvasChatMessages`、`pendingIdeogramOutput`、`pendingQualityReport` 从 active session 派生。
- 正在运行中的 request log 恢复后标记为 `error` 或保留原状态但显示“页面刷新前中断”，不能继续假装运行。

保存规则：

- 创建、切换、重命名、删除、清空会话时保存。
- 添加或更新消息时保存。
- pending output、pending quality report、request log 变化时保存。
- 可使用轻量 debounce，避免流式 token 每次都同步写入；最终 `onDone` 必须保存完整消息。

### 画布收藏

持久化 key：

- `ideogram4-canvas-favorites:v1`

建议结构：

```typescript
interface CanvasFavorite {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  snapshot: CanvasSnapshotLite;
}

interface CanvasSnapshotLite {
  canvasW: number;
  canvasH: number;
  canvasRatio: string;
  canvasScale: number;
  canvasCustomW: number;
  canvasCustomH: number;
  boxes: Array<Omit<Box, 'id' | 'imageDataUrl'> & { id?: string; imageDataUrl?: null }>;
  globalPalette: string[];
  highLevelDescription: string;
  aesthetics: string;
  lighting: string;
  medium: string;
  artStyle: string;
  background: string;
  photoArtStyleMode: 0 | 1;
}
```

快照规则：

- `boxes` 保留坐标、模式、文本、描述、颜色、imageRole。
- `imageDataUrl` 始终丢弃或写为 `null`。
- `canvasBackgroundUrl` 不进入收藏。
- 默认标题使用 `highLevelDescription` 前 24 个字符；为空时使用本地时间。

恢复规则：

- 恢复收藏覆盖当前画布、boxes 与全局 prompt 设置。
- 恢复收藏不影响 Canvas Chat 会话、chat presets、provider 配置。
- 恢复前显示确认，说明当前画布会被覆盖。
- 恢复后重新计算 `boxCounter`，避免后续新增 box id 冲突。

### Workspace Backup Settings

持久化 key：

- `ideogram4-workspace-backup-settings:v1`

建议结构：

```typescript
interface WorkspaceBackupSettings {
  schemaVersion: 1;
  githubToken: string;
  gistId: string | null;
  lastBackupAt: number | null;
  lastRestoreAt: number | null;
}
```

设置区允许用户保存、清空 token，手动替换或清空 gist id。

### Workspace 备份包

Gist 文件名：

- `ideogram4-workspace-backup.json`

建议结构：

```typescript
interface WorkspaceBackupPackageV1 {
  app: 'ideogram4-editor';
  schemaVersion: 1;
  exportedAt: number;
  modules: {
    currentCanvas: CanvasSnapshotLite;
    canvasChatSessions: PersistedCanvasChatStateV1;
    canvasFavorites: CanvasFavorite[];
    chatPresets: PromptPreset[];
    llmProviders: LlmProvider[];
    uiPreferences: {
      lang: string;
      chatModel: string;
      chatResponseLang: string;
      chatStreamEnabled: boolean;
      chatThinkingLevel: ChatThinkingLevel;
    };
  };
}
```

`llmProviders` 按现有 provider 配置完整备份，包含 API key。

## UI 设计

### Canvas Chat 会话恢复

用户进入页面时自动加载上次 Canvas Chat sessions：

- 普通态仍显示当前 active session。
- 最大化工作台左侧会话列表恢复历史会话。
- 会话增删改清都自动持久化。
- 本地数据损坏时显示非阻塞提示，并创建空会话。

不新增复杂的“保存”按钮，避免用户误以为对话需要手动保存。

### 收藏当前画布

入口建议放两个位置：

- 画布工具栏：增加收藏按钮，作为主要入口。
- Settings Workspace 区：展示收藏列表与恢复/删除/重命名操作。

收藏流程：

```text
点击收藏
  -> 生成轻量画布快照
  -> 自动命名
  -> 写入 localStorage
  -> 显示短 toast
```

收藏列表显示：

- 标题
- 创建或更新时间
- 画布尺寸
- box 数量
- 恢复、重命名、删除操作

恢复流程：

```text
点击恢复
  -> 确认当前画布会被覆盖
  -> 应用 snapshot 到 store
  -> 关闭确认并显示 toast
```

### Workspace Backup 设置区

Settings 页新增第三个区域 `Workspace`。如果当前双栏布局空间不足，可改为上方 tab 或三段纵向布局，但不要把卡片嵌套进卡片。

区域包含：

- GitHub Token 输入框。
- 固定 Gist ID 输入框或只读显示加“更换”按钮。
- 备份状态：最后备份时间、最后恢复时间。
- `立即备份` 按钮。
- `从 Gist 恢复` 按钮。
- `清空本地备份设置` 或 `更换 Gist` 入口。
- 常驻安全说明。

首次备份：

```text
填写 token
  -> 点击立即备份
  -> 没有 gistId 时创建 private Gist
  -> 保存 gistId
  -> 上传 workspace backup package
```

后续备份：

```text
点击立即备份
  -> 使用已保存 gistId PATCH 同一个 Gist
  -> 更新 lastBackupAt
```

### 恢复预览

点击“从 Gist 恢复”后：

1. 拉取固定 Gist。
2. 解析 `ideogram4-workspace-backup.json`。
3. 校验 `app` 与 `schemaVersion`。
4. 打开恢复预览。

恢复预览显示模块表：

| 模块 | 预览信息 | 默认勾选 |
| --- | --- | --- |
| 当前画布 | 尺寸、box 数、全局描述摘要 | 勾选 |
| Canvas Chat 会话 | 会话数、消息数、请求日志数 | 勾选 |
| 画布收藏 | 收藏数 | 勾选 |
| 聊天预设 | 预设数 | 勾选 |
| LLM provider | provider 数、含 API key 提示 | 默认不勾选，可手动勾选 |
| UI 偏好 | 语言、模型、流式/思考设置 | 勾选 |

用户点击确认恢复后，只覆盖勾选模块。未勾选模块保持本地现状。

## 服务设计

### 持久化服务

新增建议文件：

- `src/services/workspace-persistence.ts`

职责：

- `loadCanvasChatState()`
- `saveCanvasChatState(state)`
- `loadCanvasFavorites()`
- `saveCanvasFavorites(favorites)`
- `loadWorkspaceBackupSettings()`
- `saveWorkspaceBackupSettings(settings)`
- `safeParseStorageValue(key, validator, fallback)`

设计原则：

- 所有 `localStorage` 读取都要 `try/catch`。
- validator 只做必要结构校验，不做复杂业务校验。
- 写入失败时返回错误结果，让 UI 可以提示容量或权限问题。

### Workspace Backup 服务

新增建议文件：

- `src/services/workspace-backup.ts`

职责：

- `buildWorkspaceBackupPackage(storeState, externalModules)`
- `parseWorkspaceBackupPackage(raw)`
- `createRestorePreview(package)`
- `applyWorkspaceRestore(package, selections)`

`externalModules` 包括：

- chat presets
- LLM providers
- UI preferences

恢复应用规则：

- 当前画布模块调用专用 action 应用 `CanvasSnapshotLite`。
- Canvas Chat 模块替换 sessions，并同步 active session 派生字段。
- 收藏模块替换收藏列表。
- Chat presets 使用现有 preset 持久化逻辑。
- LLM providers 使用现有 provider 持久化逻辑。
- UI preferences 写回对应 localStorage key 并更新 store 字段。

### Gist 服务

新增建议文件：

- `src/services/gist-backup.ts`

职责：

- `createBackupGist(token, packageJson)`
- `updateBackupGist(token, gistId, packageJson)`
- `loadBackupGist(token, gistId)`

GitHub API：

```text
POST https://api.github.com/gists
PATCH https://api.github.com/gists/{gistId}
GET https://api.github.com/gists/{gistId}
```

创建 payload：

```json
{
  "description": "Ideogram4 Editor workspace backup",
  "public": false,
  "files": {
    "ideogram4-workspace-backup.json": {
      "content": "{...}"
    }
  }
}
```

更新 payload：

```json
{
  "files": {
    "ideogram4-workspace-backup.json": {
      "content": "{...}"
    }
  }
}
```

请求头：

```text
Authorization: Bearer <token>
Accept: application/vnd.github+json
Content-Type: application/json
```

## 错误处理

- token 缺失：禁用备份/恢复按钮，提示先填写 token。
- token 权限不足或过期：显示 GitHub 状态码与简短原因。
- Gist ID 为空：备份时创建新 private Gist；恢复时提示先备份或填写 Gist ID。
- Gist 不存在：提示更换 Gist ID 或重新创建备份。
- 备份文件缺失：提示该 Gist 不是 Ideogram workspace backup。
- JSON 解析失败：禁止恢复，显示解析错误摘要。
- schema 不匹配：禁止恢复，提示版本不兼容。
- localStorage 写入失败：提示可能超过浏览器存储限制，建议删除旧会话或收藏。
- 部分模块恢复失败：停止恢复并提示失败模块，不做静默吞错。

## 数据流

### Canvas Chat 持久化

```text
页面加载
  -> loadCanvasChatState()
  -> validate
  -> 初始化 sessions 与 active session 派生字段

会话变化
  -> store action 更新状态
  -> saveCanvasChatState()
```

### 收藏画布

```text
用户点击收藏
  -> 从 store 读取当前画布
  -> buildCanvasSnapshotLite()
  -> addCanvasFavorite()
  -> saveCanvasFavorites()
```

### 备份到 Gist

```text
用户点击立即备份
  -> 校验 token
  -> buildWorkspaceBackupPackage()
  -> 没有 gistId: createBackupGist()
  -> 已有 gistId: updateBackupGist()
  -> 保存 gistId 与 lastBackupAt
```

### 从 Gist 恢复

```text
用户点击从 Gist 恢复
  -> 校验 token 和 gistId
  -> loadBackupGist()
  -> parseWorkspaceBackupPackage()
  -> 展示 WorkspaceBackupPreview
  -> 用户选择模块并确认
  -> applyWorkspaceRestore()
  -> 保存 lastRestoreAt
```

## 测试计划

### Store 与持久化测试

- Canvas Chat sessions 正常加载。
- 损坏 JSON 回退为空会话。
- 删除 active session 后持久化 next active session。
- 流式消息更新最终保存完整 assistant content。
- 创建画布收藏时丢弃所有图片 Data URL。
- 恢复画布收藏后重新计算 `boxCounter`。

### Workspace Backup 服务测试

- 组包包含所有确认模块。
- 备份包包含 LLM provider API key。
- schema 不匹配时解析失败。
- 恢复预览正确统计模块数量。
- 只恢复勾选模块，未勾选模块保持不变。

### Gist 服务测试

- create 请求使用 `public: false`。
- update 请求覆盖固定文件名。
- load 请求读取固定文件内容。
- 401、403、404、文件缺失分别返回可显示错误。

### UI 测试

- 刷新后 Canvas Chat 会话恢复。
- 点击收藏创建收藏项。
- 收藏恢复前显示覆盖确认。
- Settings Workspace 区保存 token 与 gist id。
- 没有 token 时备份/恢复按钮不可用。
- 从 Gist 拉取后展示恢复预览，并按勾选模块覆盖。

## 实施顺序建议

1. 抽出 `workspace-persistence`，先完成 Canvas Chat sessions 持久化。
2. 增加 `CanvasFavorite` 类型、store actions 与收藏/恢复测试。
3. 在 UI 中加入收藏入口与 Settings Workspace 收藏列表。
4. 实现 backup settings 持久化。
5. 实现 workspace backup package 的组包、解析、预览和模块恢复。
6. 实现 gist service 与 Settings Backup UI。
7. 补齐恢复预览 UI 与错误提示。
8. 跑完整测试并做一次真实浏览器手动验证。
