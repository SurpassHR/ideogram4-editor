# AI 交互功能设计规格

**日期**：2026-06-15
**项目**：ideogram4-editor

---

## Context

Ideogram JSON Prompt 可视化编辑器当前只有基础的 box 绘制/拖拽/属性编辑功能，以及一个未实现的 LLM 配置入口（"Optimize Prompt" 按钮是灰色占位）。用户希望增加三个 AI 交互功能：

1. **双击 box 内联编辑** — 直接在画布上编辑 box 内容
2. **AI 对话浮动面板** — 选中 box 后通过图标按钮打开 AI 对话，生成/优化 box 内容
3. **全局设置 AI 优化按钮** — 输入框旁的 ✨ 按钮，一键优化提示词

---

## 架构方案：混合架构

- **对话历史** → Zustand store（`chatHistories: Record<boxId, Message[]>`），持久化、跨组件共享
- **面板状态** → Store（`activeChatBoxId`、`isChatOpen`）
- **LLM 调用** → 独立 `llm-chat.ts` 服务模块，纯函数，无状态副作用
- **优化建议** → 组件本地 state（临时的，采纳/忽略后消失）
- **内联编辑** → 组件本地 state（`isEditingBox`），临时交互状态
- **新增文件**：

```
src/
├── services/
│   └── llm-chat.ts                # LLM 调用服务（纯函数）
├── components/
│   ├── canvas/
│   │   ├── BoundingBox.tsx        # 修改：增加 ✨ 图标 + 双击检测
│   │   ├── InlineEditOverlay.tsx  # 新增：内联编辑覆盖层
│   │   └── ChatBubbleButton.tsx   # 新增：box 上的 ✨ 图标按钮
│   ├── chat/
│   │   ├── ChatPanel.tsx          # 新增：浮动 AI 对话面板
│   │   └── ChatMessage.tsx        # 新增：单条消息渲染
│   └── panels/
│   │   ├── GlobalSettingsPanel.tsx # 修改：用 OptimizableInput 替换原生 input
│   │   ├── SuggestionBar.tsx      # 新增：优化建议条组件
│   │   └── OptimizableInput.tsx   # 新增：带 ✨ 按钮的输入框包装器
├── hooks/
│   ├── useInlineEdit.ts           # 新增：双击进入/退出编辑逻辑
│   └── useChatPanel.ts            # 新增：对话框面板状态管理
├── types/
│   └── chat.ts                    # 新增：ChatMessage 类型
└── store/
    └── index.ts                   # 修改：增加 chatHistories + activeChat
```

---

## 功能 1：双击内联编辑

### 交互流程

```
普通状态 → 双击 box → 编辑状态 → Esc/点击外部/Ctrl+Enter → 普通状态
```

### 双击检测

在 `BoundingBox.tsx` 中监听 `onDoubleClick` 事件。与现有单击选中/拖拽不冲突：
- 单击（pointer down + pointer up，无移动）→ 选中 box
- 按住并移动 → 拖拽 box
- 双击 → 进入编辑模式

### 编辑字段选择

| box.mode | 编辑字段 | placeholder |
|----------|---------|-------------|
| `'obj'` | `desc` | "描述此区域的内容..." |
| `'text'` | `text` | "输入文本内容..." |

### InlineEditOverlay 组件

编辑激活时，在 `BoundingBox` 内部渲染 input/textarea，覆盖 box 全部区域：
- 背景：`rgba(0,0,0,0.6)` 半透明覆盖
- 文字：`var(--text)` (#e8e8f0)
- 字体：跟随 box 尺寸自适应
- 对齐：居中
- resize-handle 在编辑模式下隐藏（`opacity: 0` + `pointer-events: none`）
- ✨ 图标在编辑模式下隐藏

### 退出编辑

- **Esc** → 退出并保存当前值
- **点击 box 外部** → 退出并保存
- **Enter**（单行 input）→ 退出并保存
- **Ctrl+Enter**（textarea）→ 退出并保存

### useInlineEdit hook

```ts
interface UseInlineEdit {
  editingBoxId: string | null;
  editingField: 'text' | 'desc' | null;
  startEdit: (boxId: string, field: 'text' | 'desc') => void;
  stopEdit: () => void;
}
```

- `startEdit` 设置本地 state + 调用 `selectBox(boxId)`
- 编辑期间拖拽/绘制行为被屏蔽

---

## 功能 2：AI 对话浮动面板

### ChatBubbleButton（触发图标）

- **位置**：选中 box 右上角（`top: -8px; right: -8px`），18×18px 圆形
- **图标**：✨
- **可见性**：仅在 box 选中时显示
- **行为**：点击 → `store.openChat(boxId)`，打开浮动面板

### ChatPanel（浮动面板）

**定位**：
- 初始位置：box 下方偏右（计算位置避免超出视口）
- 不支持拖拽移动（保持简单）
- 固定 `width: 320px`，`max-height: 400px`

**面板结构**：
```
┌─ Header ──────────────────────────────────────┐
│ ✨ AI 对话  [box:猫]  模型:[下拉]  ✕关闭     │
├─ Messages ────────────────────────────────────┤
│ 用户消息（右侧紫色气泡）                       │
│ AI 回复（左侧暗色气泡）[采纳/忽略按钮]        │
│ 已采纳的回复标记 ✓                             │
├─ Input ────────────────────────────────────────┤
│ [输入框] [发送]                                │
└─────────────────────────────────────────────────┘
```

**模型选择下拉**：
- 数据来源：`getLlmProviders()` → 所有 provider + models
- 显示格式：`provider_name / model_id`
- 默认：上次使用的（localStorage key `ideogram4-chat-model`）
- 无配置时：灰色提示 "请先配置 LLM"

### Chat State（Store 扩展）

```ts
// 新增 store 字段
chatHistories: Record<string, ChatMessage[]>;
activeChatBoxId: string | null;
isChatOpen: boolean;

// 新增 store actions
openChat(boxId: string);
closeChat();
addChatMessage(boxId: string, msg: ChatMessage);
clearChatHistory(boxId: string);
```

```ts
// src/types/chat.ts
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  adopted?: boolean;
}
```

### LLM 调用服务层（`llm-chat.ts`）

```ts
async function sendChatMessage(
  provider: LlmProvider,
  model: string,
  messages: ChatMessage[],
  systemPrompt: string
): Promise<{ ok: boolean; content?: string; error?: string }>
```

- 按 provider.kind 分发 API 调用（openai/anthropic/gemini/openai_compat）
- 不支持流式（先简化，后续可扩展）
- 30s 请求超时
- 错误返回 `{ok: false, error}` 结构

### System Prompt（Box Chat）

> "你是 Ideogram 4 图像生成模型的提示词专家。用户正在描述图像中某个区域的内容。请根据用户的描述生成更详细、更精准的英文提示词，适合直接用于 Ideogram 4 的图像生成。回复应包含详细的视觉描述（颜色、材质、光照、姿态、场景细节等）。用户可以用中英文对话，但你的回复必须是英文提示词。"

### 采纳流程

1. AI 回复底部显示「采纳」「忽略」按钮
2. 采纳 → `updateBox(boxId, {desc/text})`，标记 `adopted = true`，面板不关闭
3. 再次采纳 → 替换 box 内容（不追加）
4. 忽略 → 仅标记已读，不修改 box

---

## 功能 3：全局设置 AI 优化按钮

### OptimizableInput 包装器

```ts
interface OptimizableInputProps {
  label: string;
  fieldKey: string;
  value: string;
  onChange: (val: string) => void;
  multiline?: boolean;
  disabled?: boolean;
  placeholder?: string;
}
```

- ✨ 按钮仅在 `value` 不为空时启用
- ✨ 按钮样式：小按钮，`border: 1px solid var(--text-muted)`，hover → `var(--primary)`
- 覆盖字段：highLevelDescription, aesthetics, lighting, medium, artStyle, background

### SuggestionBar 组件

```ts
interface SuggestionBarProps {
  original: string;
  suggested: string;
  status: 'loading' | 'ready' | 'adopted' | 'dismissed';
  onAdopt: () => void;
  onDismiss: () => void;
}
```

- `loading` → 动画 + "AI 正在优化..."
- `ready` → 建议内容 + 「采纳」「忽略」按钮
- `adopted`/`dismissed` → 不渲染

### 优化流程

1. 点击 ✨ → 输入框 `disabled` + `opacity: 0.6`
2. 调用 `llm-chat.ts.optimizeText(provider, model, currentText, fieldKey)`
3. 成功 → SuggestionBar 显示建议
4. 采纳 → `onChange(suggested)` 替换值，建议条消失
5. 忽略 → 输入框恢复，建议条消失
6. 失败 → toast 错误提示，输入框恢复

### 字段级 System Prompt

| fieldKey | 优化方向 |
|----------|---------|
| `highLevelDescription` | 增加视觉细节、构图信息 |
| `aesthetics` | 从简单描述 → 精确美学风格 |
| `lighting` | 从简单词 → 详细光照场景 |
| `medium` | 从简单词 → 精确媒介描述 |
| `artStyle` | 从简单词 → 详细艺术风格 |
| `background` | 增加环境细节和氛围 |

**通用约束**：所有优化结果生成英文（Ideogram 4 prompt 用英文）。

### 与 Chat 服务层的关系

```
Chat 面板: sendChatMessage(provider, model, messages[], systemPrompt)
优化按钮: optimizeText(provider, model, currentText, fieldKey)
```

`optimizeText` 内部构造单轮对话（user = currentText），本质是 `sendChatMessage` 的简化调用。

---

## Spec 自审

1. **Placeholder scan**: 无 TBD/TODO，所有章节完整 ✓
2. **Internal consistency**: AI 回复英文 + box desc/text 填入英文，与 Ideogram 4 英文 prompt 需求一致 ✓；Chat 面板不支持拖拽与架构描述一致 ✓
3. **Scope check**: 三个功能紧密相关（共享 LLM 服务层），适合单次实现 ✓
4. **Ambiguity check**: "采纳"行为明确（填充+不关闭）；优化按钮行为明确（先建议后选择）；编辑字段选择有明确规则 ✓

---

## 验证计划

1. **内联编辑**：双击 obj 模式 box → 出现 desc 编辑 textarea；双击 text 模式 box → 出现 text 编辑 input；Esc 退出并保存；拖拽在编辑时不可用
2. **AI 对话面板**：选中 box → 看到 ✨ 图标 → 点击打开浮动面板 → 发送消息 → AI 返回英文建议 → 采纳填充 box → 继续对话 → 关闭面板 → 再次打开历史保留
3. **优化按钮**：GlobalSettingsPanel 每个 input 旁有 ✨ → 点击 → loading → 建议条出现 → 采纳替换 / 忽略恢复
4. **无 LLM 配置**：面板显示 "请先配置 LLM"，按钮禁用
5. **错误处理**：API 调用失败 → toast 提示，输入框/面板恢复正常
