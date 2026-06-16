# Box 图像参考 + Chat 提示词预设 设计文档

> 日期：2026-06-16 | 状态：待实现

## 1. 概述

为 BoundingBox 和 ChatPanel 增加两个增强功能：

1. **Box 图像支持**：Box 中可以放置图像，作为视觉背景（UI 展示）和 AI 参考图（多模态 prompt 优化）
2. **提示词预设**：ChatPanel 支持用户编辑和管理预设提示词模板，支持变量占位符和标签分类

---

## 2. 数据模型

### 2.1 Box 类型扩展

```typescript
// src/types/index.ts

export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  mode: 'obj' | 'text';
  text: string;
  desc: string;
  colors: string[];
  // 新增 ↓
  imageDataUrl: string | null;   // Data URL（base64）或 Blob URL
  imageRole: 'background' | 'reference' | 'both';  // 默认 'both'
}
```

### 2.2 预设类型

```typescript
// src/types/presets.ts（新文件）

export interface PromptPreset {
  id: string;              // 唯一标识，如 "preset_1700000000000"
  name: string;            // 预设名称，如 "人物细节增强"
  description: string;     // 用途说明
  promptTemplate: string;  // 提示词模板，支持 {box_text}, {box_desc}, {box_colors}, {box_mode}
  tags: string[];          // 用户自定义标签，如 ["人物", "细节"]
  createdAt: number;       // 创建时间戳
  updatedAt: number;       // 修改时间戳
}
```

### 2.3 Store 扩展

```typescript
// src/store/index.ts — EditorStore 接口新增字段和方法

// 预设状态
chatPresets: PromptPreset[];
addPreset: (preset: Omit<PromptPreset, 'id' | 'createdAt' | 'updatedAt'>) => void;
updatePreset: (id: string, updates: Partial<Omit<PromptPreset, 'id'>>) => void;
deletePreset: (id: string) => void;

// 图像操作
importImageToBox: (boxId: string, dataUrl: string) => void;
clearBoxImage: (boxId: string) => void;
```

### 2.4 预设持久化

- localStorage key: `ideogram4-chat-presets`
- 加载时机：store 初始化时从 localStorage 读取
- 保存时机：每次 add/update/delete 后写入 localStorage
- 首次使用自动初始化内置默认预设：
  1. "增强细节描述"（英文输出）— 标签：`细节`、`英文`
  2. "中文 prompt 优化"（中文输出）— 标签：`中文`、`通用`
  3. "场景氛围描写" — 标签：`场景`、`氛围`
  4. "人物特征增强" — 标签：`人物`、`细节`

---

## 3. Box 图像功能

### 3.1 图像导入

三种导入方式，统一走同一个处理链路：

```
拖放/上传/粘贴 → File/Blob → FileReader.readAsDataURL() → Data URL
                                                              ↓
                                          importImageToBox(boxId, dataUrl)
                                                              ↓
                                          store 更新 box.imageDataUrl
```

| 方式 | 实现位置 | 触发条件 |
|------|---------|---------|
| 拖放 | `useBoxImageImport` hook（新） | 监听 box 上的 `dragover`/`drop`，检测 `dataTransfer.files` |
| 上传按钮 | `BoxPropertiesPanel` + `BoundingBox` 编辑态 | 点击 📷 按钮，触发隐藏 `<input type="file" accept="image/*">` |
| 粘贴 | `CanvasArea` 或独立 hook | `paste` 事件，检测 `clipboardData.items` 中的图片类型 |

### 3.2 BoundingBox UI 渲染

当 `box.imageDataUrl` 不为空时：

- 在 `.bounding-box` 内部渲染 `<img>` 作为背景层
- CSS: `position: absolute; inset: 0; z-index: 0; opacity: 0.6; object-fit: cover`
- 文字标签和编辑 input 在 `z-index: 1` 层
- 鼠标悬停在 box 上时，图像区域右上角显示小 ✕ 按钮（`z-index: 2`），点击调用 `clearBoxImage()` 删除图像
- 删除按钮仅在 hover 时可见，使用 `opacity` 过渡动画

### 3.3 图像传入 AI（多模态）

当 box 有图像且 `imageRole` 为 `'reference'` 或 `'both'` 时，用户消息改为多模态格式：

**OpenAI / OpenAI Compatible**：
```typescript
{
  role: "user",
  content: [
    { type: "image_url", image_url: { url: imageDataUrl } },
    { type: "text", text: "用户消息文本" }
  ]
}
```

**Anthropic**：
```typescript
{
  role: "user",
  content: [
    { type: "image", source: { type: "base64", media_type: "image/png", data: "base64string" } },
    { type: "text", text: "用户消息文本" }
  ]
}
```

**Gemini**：对应的多模态 `parts` 格式。

### 3.4 系统提示词调整

当 box 有参考图时，`buildBoxChatSystemPrompt` 追加引导指令：

> "This box has a reference image attached. Use the visual content of the image to inform your prompt — describe what you see and how it relates to the user's text description."

### 3.5 JSON 导出

- `generateJSON()`：每个 element 可选新增 `image_data` 字段。`JsonToolbar` 生成 JSON 时通过一个 checkbox 让用户选择是否包含图像数据（默认不包含，避免 JSON 过大）
- `loadFromJSON()`：对应解析 `image_data` 字段还原到 box

---

## 4. 提示词预设功能

### 4.1 预设管理面板

新组件 `PresetManagerPanel`（模态框，类似 `LlmConfigPanel` 模式）：

```
┌─────────────────────────────────────────┐
│  Preset Manager                      ✕  │
├─────────────────────────────────────────┤
│  🔍 [搜索...]  🏷 [标签筛选下拉]  [+ 新增] │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │ 📝 人物细节增强                  │    │
│  │    增强人物面部、服饰、姿态细节    │    │
│  │    🏷 人物  🏷 细节              │    │
│  │    [编辑] [删除] [复制]          │    │
│  └─────────────────────────────────┘    │
│  ...                                    │
├─────────────────────────────────────────┤
│  编辑区（选中预设后展开）                  │
│  名称: [________________]                │
│  描述: [________________]                │
│  模板: [________________]                │
│  标签: [人物] [细节] [+ 添加标签]         │
│  变量参考: {box_text} {box_desc}          │
│           {box_colors} {box_mode}        │
│  [保存] [取消]                           │
└─────────────────────────────────────────┘
```

### 4.2 ChatPanel 集成

ChatPanel header 新增预设下拉框：

```
┌─ ChatPanel Header ───────────────────────────────────────────┐
│ 💬 AI Chat  [Box: xxx]  [模型▾]  [预设▾]  [⚙管理]  🗑 ✕     │
└──────────────────────────────────────────────────────────────┘
```

- **预设下拉框**：列出所有预设名称，按标签分组，支持搜索过滤
- **选中预设后**：模板文本自动填入输入框，变量占位符保留（用户可继续编辑）
- **⚙ 管理按钮**：打开 `PresetManagerPanel` 模态框
- **快速新增**：下拉框底部有 "+ 新建预设" 选项，弹出简易编辑表单

### 4.3 变量替换

发送消息前，对模板执行变量替换：

```typescript
function resolveTemplate(template: string, box: Box): string {
  return template
    .replace(/\{box_text\}/g, box.text || '')
    .replace(/\{box_desc\}/g, box.desc || '')
    .replace(/\{box_colors\}/g, box.colors.join(', '))
    .replace(/\{box_mode\}/g, box.mode);
}
```

替换后的文本作为用户消息发送给 LLM。

### 4.4 数据流

```
用户选择预设 → 模板填入输入框 → 用户编辑/确认
    → 发送时 resolveTemplate() 替换变量
    → sendChatMessage() 发送（含可选图像参考）
    → LLM 返回结果 → 显示在对话中
```

---

## 5. 关键文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/types/index.ts` | 修改 | Box 新增 `imageDataUrl`、`imageRole` 字段 |
| `src/types/presets.ts` | **新建** | `PromptPreset` 接口定义 |
| `src/store/index.ts` | 修改 | 新增 `chatPresets` 状态、预设 CRUD、图像操作方法 |
| `src/components/canvas/BoundingBox.tsx` | 修改 | 渲染背景图像，编辑态增加上传按钮 |
| `src/components/panels/BoxPropertiesPanel.tsx` | 修改 | 图像预览 + 上传/清除按钮 |
| `src/hooks/useBoxImageImport.ts` | **新建** | 拖放/粘贴图像导入 hook |
| `src/services/llm-chat.ts` | 修改 | `sendChatMessage` 支持多模态图像输入；`buildBoxChatSystemPrompt` 追加参考图指令 |
| `src/components/chat/ChatPanel.tsx` | 修改 | header 增加预设下拉框 + 管理按钮 |
| `src/components/chat/PresetManagerPanel.tsx` | **新建** | 预设管理模态框 |
| `src/hooks/useChatPanel.ts` | 修改 | 暴露预设相关状态和方法 |
| `src/utils/json-serializer.ts` | 修改 | `generateJSON`/`loadFromJSON` 支持可选图像导出 |
| `src/i18n/translations.ts` | 修改 | 新增预设和图像相关翻译 key |

---

## 6. 测试策略

### 6.1 单元测试

| 测试对象 | 测试内容 |
|---------|---------|
| `resolveTemplate()` | 正确替换所有变量占位符；未知变量保持原样 |
| `buildBoxChatSystemPrompt()` | 有/无参考图时生成正确的系统提示词 |
| `importImageToBox()` | 正确更新 box 的 `imageDataUrl` |
| `addPreset`/`updatePreset`/`deletePreset` | CRUD 操作正确性 + localStorage 持久化 |
| 多模态消息格式 | OpenAI/Anthropic/Gemini 三种格式正确构造 |

### 6.2 组件测试

| 组件 | 测试内容 |
|------|---------|
| `BoundingBox` | 有图像时渲染背景图；无图像时不渲染 |
| `BoxPropertiesPanel` | 图像预览显示、上传按钮触发、清除按钮工作 |
| `ChatPanel` | 预设下拉框渲染、选中预设填入输入框 |
| `PresetManagerPanel` | 预设列表渲染、搜索过滤、标签筛选、CRUD 操作 |

### 6.3 集成测试

- 拖放图像到 box → 背景渲染 → 发送消息含多模态内容
- 选择预设 → 变量替换 → 发送消息 → 接收回复