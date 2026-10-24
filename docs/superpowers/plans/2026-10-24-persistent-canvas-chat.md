# 常驻沉浸式 Canvas Chat 与极致创作心流 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建常驻底部的 Krea 风格沉浸式指令胶囊岛，提供一键全场景补全落框与参考背景图反推落框的丝滑交互流。

**Architecture:** 
1. 在画板底部视口正下方挂载常驻的 `BottomCommandBar` 组件，与画板比例、选中 BBox 及背景图状态强联动。
2. 扩充 `llm-canvas-chat.ts`，新增构图速写场景自动补全（`buildSceneAutoCompletePrompt`）与背景图多模态反推（`buildImageInversionPrompt`）提示词与解析管道。
3. 扩展 `useEditorStore` 状态与动作（补全中/反推中防重入、选区联动快捷清除、就地静默落框与单步 Undo 栈保护）。

**Tech Stack:** React 19 + TypeScript, Zustand 5, Tailwind / 自定义 CSS 变量, SVG 图标系统 (`icons.tsx`), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-24-persistent-canvas-chat-design.md`

## Global Constraints

- 黑暗工业美学：遵循 `docs/design/krea-style-and-interaction-guide.md`，色彩使用 `#101010`、`#141414`、`#1a1a1a` 与 `rgba(255,255,255,0.08/0.14)` 边框。
- 零 Emoji 规范：所有图标必须导出自 `src/components/ui/icons.tsx`，禁止在 JSX 或翻译中使用内联 Emoji 或 Unicode 符号。
- 物理像素恒定：指令岛在画板平移和缩放时保持固定的屏幕物理像素尺寸，不随画布 zoom 变形。
- 零阻碍心流：速写补全与反推落框必须直接生效并单步压栈，严禁弹出阻塞式确认模态框。

## Review Focus

1. **画布无任何 BBox 且输入为空时触发补全**：应给出轻量提示或基于全局环境生成初始构图，而不应抛出异常或生成损坏数据。
2. **多模态反推时背景图为空或超大图片处理**：若没有背景图触发反推需优雅降级；超大图反推需做好尺寸与多模态负载控制。
3. **连击或网络中途重入 (Double Trigger)**：一键补全或反推请求过程中禁用按钮并展示加载动画，阻止重复触发导致并发脏写。
4. **局部选区状态切换**：当选中 BBox 时，指令岛应准确高亮指示局部目标并在点击清除时无缝切回全景。
5. **撤销一致性**：自动补全落框后，单次 `Cmd+Z` 必须能够完整回到补全前的画布状态，而不是留下半截修改。

---

### Task 1: 提示词生成与解析服务扩展 (Scene Auto-Complete & Image Inversion Prompts)

**Files:**
- Modify: `src/services/llm-canvas-chat.ts`
- Test: `src/services/__tests__/llm-canvas-chat-autocomplete.test.ts`

**Interfaces:**
- Produces:
  - `buildSceneAutoCompletePrompt(boxes: Box[], canvasW: number, canvasH: number, userInput?: string): string`
  - `buildImageInversionPrompt(canvasW: number, canvasH: number): string`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/__tests__/llm-canvas-chat-autocomplete.test.ts
import { describe, it, expect } from 'vitest';
import { buildSceneAutoCompletePrompt, buildImageInversionPrompt } from '../llm-canvas-chat';
import type { Box } from '../../types';

describe('Scene Auto-Complete and Inversion Prompt Builders', () => {
  it('buildSceneAutoCompletePrompt generates structured prompt with boxes and dimensions', () => {
    const boxes: Box[] = [{
      id: 'box-1',
      x: 100,
      y: 100,
      w: 200,
      h: 200,
      mode: 0,
      text: 'astronaut',
      desc: '',
      colors: []
    }];
    const prompt = buildSceneAutoCompletePrompt(boxes, 1024, 1024, 'cyberpunk style');
    expect(prompt).toContain('astronaut');
    expect(prompt).toContain('cyberpunk style');
    expect(prompt).toContain('high_level_description');
    expect(prompt).toContain('elements');
  });

  it('buildImageInversionPrompt generates inversion prompt with canvas dimensions', () => {
    const prompt = buildImageInversionPrompt(1920, 1080);
    expect(prompt).toContain('1920');
    expect(prompt).toContain('1080');
    expect(prompt).toContain('object');
    expect(prompt).toContain('text');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/services/__tests__/llm-canvas-chat-autocomplete.test.ts`
Expected: FAIL with "buildSceneAutoCompletePrompt is not defined"

- [ ] **Step 3: Implement prompt builders in `src/services/llm-canvas-chat.ts`**

在 `llm-canvas-chat.ts` 中实现并导出 `buildSceneAutoCompletePrompt` 和 `buildImageInversionPrompt`，规范模型必须输出合法的 JSON 格式与坐标归一化规则（0-1000）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/services/__tests__/llm-canvas-chat-autocomplete.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/llm-canvas-chat.ts src/services/__tests__/llm-canvas-chat-autocomplete.test.ts
git commit -m "feat(canvas-chat): add scene auto-complete and image inversion prompt builders"
```

---

### Task 2: Store 状态扩展 (Command Bar 状态与并发控制)

**Files:**
- Modify: `src/store/index.ts`
- Test: `src/store/__tests__/command-bar-store.test.ts`

**Interfaces:**
- Produces in `useEditorStore`:
  - `isGeneratingScene: boolean`
  - `isExtractingImage: boolean`
  - `setIsGeneratingScene(val: boolean): void`
  - `setIsExtractingImage(val: boolean): void`

- [ ] **Step 1: Write the failing test**

```typescript
// src/store/__tests__/command-bar-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../index';

describe('EditorStore Command Bar State', () => {
  beforeEach(() => {
    useEditorStore.setState({
      isGeneratingScene: false,
      isExtractingImage: false,
    });
  });

  it('toggles isGeneratingScene and isExtractingImage', () => {
    const store = useEditorStore.getState();
    expect(store.isGeneratingScene).toBe(false);
    expect(store.isExtractingImage).toBe(false);

    store.setIsGeneratingScene(true);
    expect(useEditorStore.getState().isGeneratingScene).toBe(true);

    store.setIsExtractingImage(true);
    expect(useEditorStore.getState().isExtractingImage).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/store/__tests__/command-bar-store.test.ts`
Expected: FAIL with undefined setters

- [ ] **Step 3: Implement state and actions in `src/store/index.ts`**

添加 `isGeneratingScene` 与 `isExtractingImage` 状态及对应的 action。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/store/__tests__/command-bar-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts src/store/__tests__/command-bar-store.test.ts
git commit -m "feat(store): add command bar execution state flags"
```

---

### Task 3: 常驻底部指令岛组件 (BottomCommandBar) 开发

**Files:**
- Create: `src/components/canvas/BottomCommandBar.tsx`
- Modify: `src/components/canvas/Artboard.tsx`
- Test: `src/components/canvas/__tests__/BottomCommandBar.test.tsx`

**Interfaces:**
- Consumes:
  - `useEditorStore` (boxes, canvasW, canvasH, canvasBackgroundUrl, isGeneratingScene, isExtractingImage, etc.)
  - `buildSceneAutoCompletePrompt`, `buildImageInversionPrompt`
  - `sendChatMessageStream`
  - `applyExtractionToStore`
- Produces:
  - `<BottomCommandBar />` component mounted in `Artboard.tsx` viewport container.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/canvas/__tests__/BottomCommandBar.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { BottomCommandBar } from '../BottomCommandBar';
import { I18nProvider } from '../../../i18n/context';

describe('BottomCommandBar Component', () => {
  it('renders command bar with input and action buttons', () => {
    render(
      <I18nProvider>
        <BottomCommandBar />
      </I18nProvider>
    );
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByTestId('btn-autocomplete-scene')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/canvas/__tests__/BottomCommandBar.test.tsx`
Expected: FAIL with module not found

- [ ] **Step 3: Implement `BottomCommandBar.tsx`**

创建沉浸式胶囊岛组件，整合：
1. 比例快捷切换与当前选区标签联动指示；
2. 中央输入框，回车直发；
3. 【✨ 补全全场】主按钮与【🖼️ 反推落框】按钮（检测 `canvasBackgroundUrl`）；
4. 处理一键补全与反推落框逻辑，模型返回后直接调用 `applyExtractionToStore` 落框，并记录历史撤销步。

- [ ] **Step 4: Mount `BottomCommandBar` in `Artboard.tsx`**

在 `Artboard.tsx` 视口底部悬浮挂载 `<BottomCommandBar />`。

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/components/canvas/__tests__/BottomCommandBar.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/canvas/BottomCommandBar.tsx src/components/canvas/Artboard.tsx src/components/canvas/__tests__/BottomCommandBar.test.tsx
git commit -m "feat(ui): implement persistent BottomCommandBar component in Artboard"
```

---

### Task 4: 国际化与图标补齐 (I18n & SVG Icons)

**Files:**
- Modify: `src/i18n/translations.ts`
- Modify: `src/components/ui/icons.tsx` (如有缺失图标)
- Test: `src/i18n/__tests__/command-bar-translations.test.ts`

**Interfaces:**
- Produces:
  - `commandBar.placeholder`, `commandBar.autoComplete`, `commandBar.invertImage`, `commandBar.scopeGlobal`, `commandBar.scopeBox` 中英文词条。

- [ ] **Step 1: Write the failing test**

```typescript
// src/i18n/__tests__/command-bar-translations.test.ts
import { describe, it, expect } from 'vitest';
import { translations } from '../translations';

describe('Command Bar I18n Translations', () => {
  it('contains command bar translation keys in both en and zh', () => {
    expect(translations.en.commandBar).toBeDefined();
    expect(translations.zh.commandBar).toBeDefined();
    expect(translations.en.commandBar.autoComplete).toBeDefined();
    expect(translations.zh.commandBar.autoComplete).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/i18n/__tests__/command-bar-translations.test.ts`
Expected: FAIL with undefined keys

- [ ] **Step 3: Implement translation keys in `src/i18n/translations.ts`**

在 `translations.ts` 的中英文对象中添加 `commandBar` 对应文案。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/i18n/__tests__/command-bar-translations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/i18n/translations.ts src/i18n/__tests__/command-bar-translations.test.ts
git commit -m "feat(i18n): add translations for bottom command bar"
```

---

### Task 5: 整体构建验证与无白屏视觉走查

**Files:**
- Verify: 全局编译与全套测试

- [ ] **Step 1: Run complete test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 3: Visual QA check**

利用 Playwright 运行无头/走查测试，验证底部指令岛在画布缩放时位置固定、视觉无割裂、无白屏异常。

- [ ] **Step 4: Final Git Commit**

```bash
git commit -m "chore: complete persistent command bar integration and visual verification"
```

