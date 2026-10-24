# 常驻沉浸式 Canvas Chat 与极致创作心流设计规范

- **状态**: 草案通过 / 待评审 (Ready for Review)
- **日期**: 2026-10-24
- **目标**: 彻底消除画布与 AI 交互之间的阻碍，实现 Krea / AI Native 风格的常驻底部交互岛、一键场景补全心流与背景参考图反推落框。

---

## 1. 核心意图与痛点解决

### 1.1 现状痛点
1. **呼出阻断与状态分散**：目前使用 Canvas Chat 需要点击悬浮图标或快捷键呼出浮动窗口，输入框位置与画布割裂，心流频繁被打断。
2. **构图速写流程冗长**：用户在画布上快速拉完框、写了几个词后，无法“一键”让 Agent 全自动补齐全局场景意境（high-level）、框内微观细节（desc）和背景环境，需要经过多轮选预设、发指令、点 Apply、处理弹窗的繁琐步骤。
3. **逆向图生提示词不直达**：虽然支持背景图拖放导入，但缺乏针对参考图一键“提取物体与排版文字自动落框”的闭环能力。

### 1.2 核心目标 (Goals)
1. **常驻底部指令岛 (Bottom Command Bar)**：在画板正下方提供 Krea 风格的常驻沉浸式指令胶囊岛，整合快捷比例选择、全局/局部直达输入框、核心动作触发按钮。
2. **一键全场景补全流 (One-Click Scene Auto-Complete)**：
   - 用户在画布上拖拽绘制 1~N 个 BBox 并填写简要关键词。
   - 按下 Enter 或点击【✨ 补全全场】，Agent 全自动构建全局 `high_level_description`、完善各框的 `desc` 与文字、补全背景环境，并直接落框更新画布，保留单步 Undo 栈。
3. **背景参考图一键反推落框 (Reference Image Inversion)**：
   - 拖放/粘贴图片至画布，默认作为半透明参考背景（opacity 0.5），画布自动匹配其长宽比。
   - 底部指令岛感应到背景图，显示【🖼️ 提取物体与文字并落框】按钮。
   - 点击后由多模态视觉 Agent 扫描背景，自动在画布相应坐标反推绘制 BBox 并填充结构化描述。

### 1.3 非目标与反向目标 (Non-Goals & Anti-Goals)
- **非目标**：重构底层 ComfyUI workflow 节点注入逻辑；本次聚焦于前端画布交互流与 Agent 编排层。
- **反向目标 (Anti-Goals)**：
  - 严禁在构图速写主流程中弹出阻塞式确认模态框（如二次确认、强制检查确认），破坏零阻碍心流。
  - 严禁让代码或大段未经处理的原始 JSON 再次暴露在主界面上干扰用户。

---

## 2. 界面与交互系统设计

### 2.1 常驻底部指令岛 (Bottom Command Bar)
- **位置与层级**：固定悬浮于画板视口正下方（居中，底边距 24px，`z-index: 50`），随画布缩放平移始终保持屏幕物理尺寸。
- **视觉美学**：
  - 背景：`#141414` / `rgba(20, 20, 20, 0.85)` 毛玻璃模糊（`backdrop-filter: blur(16px)`）。
  - 边框：`1px solid rgba(255, 255, 255, 0.12)`，圆角 `9999px`（药丸胶囊状）。
  - 高度：约 44px ~ 48px，物理像素恒定。
- **组件结构布局 (Flex Row)**：
  1. **左侧控制区**：
     - **比例选择器 (Aspect Ratio)**：轻量胶囊下拉菜单（16:9, 1:1, 9:16, 4:3, 21:9 等），切换时画板自适应平滑过渡。
     - **焦点范围指示 (Scope Pill)**：当前有框被选中时，显示【局部选区 #1】；未选中任何框时显示【全景】。支持一键点击 × 取消选区。
  2. **中央直达输入框**：
     - 无边框透明输入框，占满中央可用空间，默认 placeholder：“描述你的画面，或直接拉框补全...”
     - 支持 `Enter` 键触发当前主要动作。
  3. **右侧动作触发区**：
     - **【✨ 补全全场】主按钮**：常驻高亮状态（背景 `#7c5cfc` 或高对比白底黑字），一键执行当前画布状态的自动润色与补全。
     - **【🖼️ 反推落框】按钮**：当画布存在背景参考图（`canvasBackgroundUrl` 有值）时激活显示，否则可弱化或收起。

### 2.2 构图速写补全流 (One-Click Auto-Complete Flow)
1. **触发机制**：
   - 用户在画布上拖拽 1~N 个框，或在框的 Tag 条中双击输入几个关键词（如 "astronaut", "neon sign"）。
   - 用户在底部输入框输入想法后按 Enter，或直接点击【✨ 补全全场】（无需在输入框打字）。
2. **Agent 编排与执行**：
   - 后台调用 `llm-canvas-chat.ts` 中的场景扩写提示词。
   - 输入：当前所有框的几何坐标、模式、已有文本，以及全局环境。
   - 指令要求：丰富每个框的描述、推导画面的全局光影透视氛围 (`high_level_description`)，并细致补全无框覆盖的背景细节。
   - **自动 Apply**：模型返回后跳过冗余弹窗，直接调用 `applyExtractionToStore` 更新到 Zustand store，高亮新变更的元素，并将整个状态推入撤销栈（可随时 `Cmd+Z` 撤销）。

### 2.3 背景图反推落框流 (Image-to-BBox Inversion Flow)
1. **背景载入**：用户通过拖拽图片到画布或剪贴板粘贴，触发已有的背景加载逻辑，图片以 0.5 透明度显示在画布底层，画布自适应匹配长宽比。
2. **反推触发**：底部指令岛检测到 `canvasBackgroundUrl`，高亮显示【🖼️ 提取物体与文字并落框】。
3. **视觉分析**：
   - 将背景图（Data URL 或 blob 图像）以多模态方式传给 LLM（支持多模态的视觉模型）。
   - System prompt 针对图像目标检测与文字排版识别进行针对性约束，要求输出符合规范的 0-1000 归一化 BBox 列表，区分文字（text）与物体（object）。
4. **落框渲染**：提取结果自动在画布上画出半透明边界框并对齐图像内容，用户可在此基础上微调手柄或直接使用。

---

## 3. 技术架构与实现要点

### 3.1 Store 状态扩展
- `isCommandBarFocused`: 记录当前底部输入框焦点状态。
- `isGeneratingScene`: 布尔值，标识当前是否处于一键全场补全中（用于按钮 Loading 动效与防重入）。
- `isExtractingImage`: 标识当前是否处于背景图多模态反推中。

### 3.2 服务层增强
- **`services/llm-canvas-chat.ts`**：
  - 新增专用 prompt 生成函数 `buildSceneAutoCompletePrompt(boxes, canvasW, canvasH, userInput?)`，针对极简关键词实现高质量场景补全。
  - 新增背景图反推提示词 `buildImageInversionPrompt(canvasW, canvasH)`，配合现有 `sendChatMessageStream` 或多模态图像传输。
- **`services/skill-apply.ts`**：
  - 增强落框应用逻辑，支持静默就地更新（Silent In-Place Apply），不打断视图。

### 3.3 组件与样式
- 新建组件 `src/components/canvas/BottomCommandBar.tsx`，替换或精简旧版独立浮动的 `CanvasChatPanel.tsx` 与底栏部分冗余控件。
- 遵循 `docs/design/krea-style-and-interaction-guide.md` 中的色彩系统（`#101010`、`#141414`、`#1a1a1a` 与 `rgba(255,255,255,0.08/0.14)` 边框），确保纯直角与物理像素缩放恒定。
- 图标均使用 `src/components/ui/icons.tsx` 中的 SVG 组件，严禁内联 emoji。

---

## 4. 实施阶段计划

1. **Phase 1: 常驻底部指令岛 (BottomCommandBar) 组件构建**
   - 搭建居中悬浮药丸胶囊 UI，集成比例切换、选区联动指示、输入框与主操作按钮。
2. **Phase 2: 构图速写一键补全链路打通**
   - 编写 `buildSceneAutoCompletePrompt`，连接现有 LLM 服务，实现一键直发、流式处理与自动就地落框。
3. **Phase 3: 背景图多模态反推落框链路打通**
   - 编写 `buildImageInversionPrompt`，打通背景图发送给多模态 LLM、解析坐标与落框流程。
4. **Phase 4: 细节润色与测试验证**
   - 验证快捷键支持（Enter 直发、Esc 取消选区、Cmd+Z 撤销）。
   - 运行 `npm run test` 与 `npm run build`，并通过 Playwright 验证视觉效果与无白屏。

