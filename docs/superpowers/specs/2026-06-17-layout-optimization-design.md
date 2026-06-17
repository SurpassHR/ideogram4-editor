# UI 布局优化设计

## 概述

对 Ideogram JSON Prompt 编辑器的整体 UI 布局进行三项优化：
1. **路由 + 独立设置页** — LLM 提供商管理和提示词预设管理从右侧栏和 Chat 面板碎片化入口，统一到独立设置页面
2. **宽高比 + 倍数控制** — 废除原有的宽/高两个滑块+数字输入，改用比例下拉框 + 倍数滑块
3. **右键上下文菜单** — 画布框和空白区域支持右键唤出菜单

---

## 1. 路由系统 + 独立设置页

### 1.1 路由方案

使用 **Hash-based 路由**（`window.location.hash` 实现），不引入 React Router 等外部依赖。

```
/             → 画布主页（当前应用完整界面）
/#/settings   → 设置页（LLM 提供商 + 提示词预设管理）
```

Hash 路由的 URL 形式为 `http://localhost:5173/#/settings`，不需要服务器做 SPA fallback 配置。

### 1.2 页面切换

在 `App.tsx` 中增加路由判断逻辑，根据 `window.location.hash` 渲染不同页面组件。

根组件 `App.tsx` 的结构改为：

```
App (flex column)
  ├── [hash === '#/settings' ? SettingsPage : CanvasPage]
```

### 1.3 导航条设计

导航条放在 `App.tsx` 级别的 `Header` 组件中，两个页面共享同一导航条。布局：

```
Header (flex row, align-items center)
  ├── Logo: "🎨 Ideogram Editor"（点击回到首页）
  ├── Spacer (flex: 1)
  ├── Nav 按钮组 (居中，flex justify center)
  │   ├── 🎨 Canvas（当前页高亮，可点击切换）
  │   └── ⚙ Settings（当前页高亮，可点击切换）
  ├── Spacer (flex: 1)
  ├── 工具按钮（⚙ 保留，或后续扩展）
  └── 语言切换 EN/中文
```

### 1.4 画布页（`/`）保留的内容

- **左侧列**: Artboard / JsonToolbar / ComfyUIControls / ImagePreview（不变）
- **右侧栏**: 仅保留两个 Tab — `⚙ Global` 和 `⊞ Box`（移除 `🤖 AI` Tab）
- **Chat 面板**: 选择预设/模型/语言三个 SelectMenu 下拉框保留在 Chat 面板工具栏

### 1.5 设置页（`/#/settings`）布局

设置页使用左右两栏并排布局：

```
SettingsPage (flex row, gap)
  ├── 左侧: LLM Providers 管理
  │   ├── 标题: "🤖 LLM Providers"
  │   ├── 提供商列表（卡片式，显示名称/模型/URL/状态）
  │   │   └── 每项: Edit / Delete 按钮
  │   └── "+ Add Provider" 按钮
  │
  └── 右侧: Prompt Presets 管理
      ├── 标题栏: "📋 Prompt Presets" + "+ New Preset" 按钮
      ├── 标签过滤器（可点击标签筛选）
      └── 预设列表（可编辑/复制/删除）
```

### 1.6 数据共享

LLM 提供商数据通过 `localStorage`（key: `ideogram4-llm-providers`）共享，Chat 面板读取同一存储，修改后即时生效。预设数据同为 `localStorage`（key: `ideogram4-chat-presets`）。

### 1.7 涉及文件

| 文件 | 变更 |
|------|------|
| `src/components/layout/App.tsx` | 增加 hash 路由判断，渲染 CanvasPage 或 SettingsPage |
| `src/components/layout/HeaderControls.tsx` | 重构为全局 Header，增加居中导航按钮 |
| `src/components/layout/MainContent.tsx` | 改为 CanvasPage 组件 |
| `src/components/layout/SettingsPage.tsx` | **新建** — 设置页入口，左右两栏布局 |
| `src/components/panels/RightPanelContainer.tsx` | 移除 `AI` Tab |
| `src/components/llm/LlmPanel.tsx` | 重构/迁移到设置页左侧 |
| `src/components/chat/PresetManagerPanel.tsx` | 重构/迁移到设置页右侧 |
| `src/components/chat/ChatPanel.tsx` | Chat 面板工具栏保留选择器，移除"管理预设"按钮 |
| `src/index.css` | 新增 SettingsPage 相关样式 |

---

## 2. 宽高比 + 倍数控制

### 2.1 设计思路

废除原有的画布宽/高两个独立 slider + number 输入，改为"比例 × 倍数 = 实际尺寸"的机制。

### 2.2 比例下拉框

预设比例选项（SelectMenu 组件实现）：

| 标签 | 宽高比 | 示例 (×4) |
|------|--------|-----------|
| 1:1 (方形) | 1:1 | 1024×1024 |
| 16:9 (宽屏) | 16:9 | 1820×1024 |
| 9:16 (竖屏) | 9:16 | 576×1024 |
| 4:3 (经典) | 4:3 | 1365×1024 |
| 3:2 (摄影) | 3:2 | 1536×1024 |
| 2:1 (全景) | 2:1 | 2048×1024 |
| Custom | 用户自定 | 用户输入 W:H |

选择 Custom 时，显示两个窄输入框让用户输入宽和高的数值（约束 256-4096，步进 16），计算并锁定比例。

### 2.3 倍数滑块

使用现有的 slider + slider-number 模式：

- `min = 1`（对应 256 基数）
- `max = 16`（对应 4096 基数）
- `step = 1`
- 基数固定为 256

**计算公式**：
```
实际宽度 = roundTo16(baseWidth × scale)
实际高度 = roundTo16(baseHeight × scale)
```

其中 `baseWidth` / `baseHeight` 是比例对应的最小整数尺寸，scale 是倍数滑块的当前值。

**示例**：
- 选择 16:9，scale = 4 → 基数 256×144，实际 1024×576 → roundTo16 → 1024×576
- 选择 1:1，scale = 4 → 基数 256×256，实际 1024×1024
- 选择 16:9，scale = 8 → 基数 256×144，实际 2048×1152 → roundTo16 → 2048×1152

### 2.4 HeaderControls 布局调整

移除原有的宽/高两行 slider + number 输入，改为一行的紧凑布局：

```
Ratio: [1:1 ▼]  ×  [4 ▼]  →  1024×1024
```

实时显示计算后的实际尺寸，更新到 Zustand store 的 `canvasW` / `canvasH`。

### 2.5 涉及文件

| 文件 | 变更 |
|------|------|
| `src/components/layout/HeaderControls.tsx` | 移除宽高 slider，替换为比例下拉+倍数滑块 |
| `src/store/index.ts` | setCanvasDimensions 逻辑不变，接入新 UI |
| `src/components/chat/SelectMenu.tsx` | 复用现有 SelectMenu 组件（需先解决 merge conflict） |
| `src/index.css` | 调整 HeaderControls 样式 |

---

## 3. 右键上下文菜单

### 3.1 通用菜单组件

新建可复用的 `ContextMenu` 组件：

```
ContextMenu (position: fixed, z-index: 200)
  ├── 菜单项列表
  │   ├── 普通项：label + 可选快捷键
  │   ├── 分隔线
  │   └── 危险项：红色文字（Delete / Clear 等）
  └── 点击菜单项后关闭，点击空白处关闭
```

### 3.2 框右键菜单（BoundingBox）

在 `BoundingBox` 组件上监听 `onContextMenu` 事件：

**菜单结构：**
```
┌─ Box Actions ─────────────────────┐
│ 📋 Duplicate              Ctrl+D  │
│ ✂️ Cut                    Ctrl+X  │
│ 📄 Copy to Clipboard      Ctrl+C  │
│ 🗑️ Delete                 Delete  │
├───────────────────────────────────┤
│ Layer                              │
│ ⬆ Bring to Front                  │
│ ⬇ Send to Back                    │
├───────────────────────────────────┤
│ Image                              │
│ 🖼 Import Reference Image          │（导入到此框的参考图，存入 box.imageDataUrl）
│ 🧹 Clear Reference Image           │（清除此框的参考图）
├───────────────────────────────────┤
│ ✨ Open AI Chat                    │
└───────────────────────────────────┘
```

**键盘快捷键**（全局监听）：
- `Ctrl+D` — Duplicate 选中的框
- `Ctrl+X` — Cut 选中的框（存入内部剪贴板）
- `Ctrl+C` — Copy 选中的框
- `Ctrl+V` — Paste（在画布空白处或框菜单中）
- `Delete` / `Backspace` — 删除选中的框

### 3.3 画布空白右键菜单（Canvas Background）

在 `CanvasArea` 画布背景上监听 `onContextMenu` 事件（当点击位置没有框时触发）：

**菜单结构：**
```
┌─ Canvas ──────────────────────────┐
│ 📋 Paste                  Ctrl+V  │
│ 🖼 Import Background Image        │（画布级背景参考图，渲染在 boxes 下方）
│ 🧹 Clear Background Image         │（清除画布背景图）
├───────────────────────────────────┤
│ 🧹 Clear All Boxes                │
│ 📐 Fit to Artboard                │
└───────────────────────────────────┘
```

### 3.4 画布级背景图（新增 store 字段）

当前 store 中仅有 box 级别的 `imageDataUrl` 字段，没有画布级别的背景图片。需新增：

```ts
// Zustand store 新增
canvasBackgroundUrl: string | null  // 画布背景参考图片的 Data URL
setCanvasBackgroundUrl(url: string | null) => void  // 设置/清除
```

- 画布背景图通过画布右键菜单"Import Background Image"导入（FileReader → Data URL）
- 在 `CanvasArea` 中渲染在 boxes 下方（`<img>` 标签，`position: absolute`, `width: 100%`, `height: 100%`, `object-fit: contain`, `opacity: 0.5`）
- 清除操作用 `setCanvasBackgroundUrl(null)`
- 不影响 JSON 生成输出（仅为视觉辅助参考）

### 3.5 交互行为

- 右键点击目标元素 → 阻止默认浏览器菜单 → 在鼠标位置弹出自定义菜单
- 再次点击任意位置 → 关闭菜单
- 点击菜单项 → 执行对应操作 + 关闭菜单
- 菜单弹出位置做边界检测，避免溢出视口
- 单次只允许一个上下文菜单打开

### 3.6 剪贴板机制

内部的 Cut / Copy / Paste 操作使用一个内部剪贴板（in-memory 变量，非 OS 剪贴板）：

- `Copy`：将选中 box 的完整数据（含 id、坐标、样式等）存入内部剪贴板
- `Cut`：Copy + 从 boxes 数组中移除该 box
- `Paste`：从剪贴板读取 box 数据 → 生成新 id（`boxCounter++`）→ 坐标偏移 (dx=20, dy=20) 避免完全重叠 → 添加到 boxes 数组。画布空白处粘贴时，偏移参考鼠标右键点击位置（转换为画布坐标）。

### 3.7 涉及文件

| 文件 | 变更 |
|------|------|
| `src/components/canvas/ContextMenu.tsx` | **新建** — 通用右键菜单组件 |
| `src/components/canvas/BoundingBox.tsx` | 增加 onContextMenu 监听 |
| `src/components/canvas/CanvasArea.tsx` | 增加画布背景 onContextMenu 监听 |
| `src/store/index.ts` | 新增 duplicateBox / cutBox / pasteBox 等操作 |
| `src/hooks/usePointerInteraction.ts` | 处理键盘快捷键（Ctrl+C/V/D/X/Delete） |
| `src/index.css` | 新增 ContextMenu 样式 |

---

## 4. 前置条件

### 4.1 合并冲突状态

合并冲突已解决（`SelectMenu.tsx` 采用 Portal 方案，`ChatPanel.tsx` 和 `index.css` 已合并）。当前 git 状态 clean，无冲突标记。

### 4.2 移除 `🤖 AI` Tab

从 `RightPanelContainer` 中移除 AI Tools Tab，其功能迁移到 `/#/settings` 页面。

---

## 5. 验证方法

1. **路由切换** — 点击 Canvas / Settings 导航按钮，确认页面正确切换，URL hash 更新
2. **设置页** — 在设置页添加/编辑/删除 LLM 提供商，确认数据持久化；切换到画布页，Chat 面板中能看到新提供商
3. **宽高比** — 选择不同比例（1:1 / 16:9 / Custom），调整倍数滑块，确认实际尺寸正确计算且 roundTo16 生效
4. **右键菜单** — 在框上右键，确认菜单完整显示且位置正确；点击菜单项执行对应操作；点击框外关闭菜单
5. **键盘快捷键** — Ctrl+D / Ctrl+C / Ctrl+V / Delete 等快捷键在画布上生效
6. **画布空白菜单** — 在空白区右键，确认菜单显示 Import/Clear Background、Clear All Boxes、Fit to Artboard
7. **回归测试** — `npm run test` 通过
8. **构建测试** — `npm run build` 无错误