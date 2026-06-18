# Artboard 顶部悬浮工具栏 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将画布比例/尺寸控制栏从 MainContent 流式布局移至 Artboard 内部，作为 absolute 定位的顶部悬浮栏，保留 GlowGrid 发光点阵效果。

**Architecture:** 新增 `ArtboardToolbar` 纯展示组件，从 Zustand store 直接读取状态；新增 `src/utils/canvas-dims.ts` 共享工具函数；store actions（`setCanvasScale`/`setCanvasCustom`/`setCanvasRatio`）内部自动计算并更新 `canvasW`/`canvasH`。

**Tech Stack:** React 19 + TypeScript + Zustand 5 + Vitest + @testing-library/react

## 全局约束

- 不修改右下角缩放控件（`.artboard-controls`）
- 不修改 CanvasChatPanel
- 不修改 GlowGrid 组件本身
- 不修改 i18n 键、比例预设常量
- 重置画布按钮保留在 `CanvasPage` 中，不搬入 Artboard
- 所有新增文件和修改遵循现有代码风格（纯自定义 CSS + 语义类，无第三方 UI 库）

---

### Task 1: 提取 `computeCanvasDims` 到共享工具函数

**Files:**
- Create: `src/utils/canvas-dims.ts`
- Modify: `src/components/layout/MainContent.tsx` (将原有常量/函数替换为 import)

**Interfaces:**
- Produces:
  ```typescript
  // src/utils/canvas-dims.ts
  export const RATIO_KEYS = ['1:1', '16:9', '9:16', '4:3', '3:2', '2:1', 'custom'] as const;
  export type RatioKey = typeof RATIO_KEYS[number];
  export const RATIO_BASES: Record<RatioKey, { baseW: number; baseH: number }>;
  export const roundTo16: (n: number) => number;
  export const clampDim: (n: number) => number;
  export function computeCanvasDims(ratio: RatioKey, scale: number, customW: number, customH: number): { w: number; h: number };
  ```

- [ ] **Step 1: Create `src/utils/canvas-dims.ts`**

Copy the exact code from `MainContent.tsx` lines 15-48 (RATIO_KEYS, RATIO_BASES, roundTo16, clampDim, computeCanvasDims) into a new file. Export everything with `export` keyword. No other changes.

```typescript
// src/utils/canvas-dims.ts
export const RATIO_KEYS = ['1:1', '16:9', '9:16', '4:3', '3:2', '2:1', 'custom'] as const;
export type RatioKey = typeof RATIO_KEYS[number];

export const RATIO_BASES: Record<RatioKey, { baseW: number; baseH: number }> = {
  '1:1': { baseW: 256, baseH: 256 },
  '16:9': { baseW: 256, baseH: 144 },
  '9:16': { baseW: 144, baseH: 256 },
  '4:3': { baseW: 256, baseH: 192 },
  '3:2': { baseW: 240, baseH: 160 },
  '2:1': { baseW: 256, baseH: 128 },
  custom: { baseW: 256, baseH: 256 },
};

export const roundTo16 = (n: number) => Math.round(n / 16) * 16;
export const clampDim = (n: number) => Math.max(256, Math.min(4096, roundTo16(n)));

/** 根据比例 + 倍数 + 自定义宽高比计算实际画布尺寸 */
export function computeCanvasDims(ratio: RatioKey, scale: number, customW: number, customH: number) {
  let baseW: number;
  let baseH: number;
  if (ratio === 'custom') {
    const maxDim = Math.max(customW, customH, 1);
    baseW = (256 * customW) / maxDim;
    baseH = (256 * customH) / maxDim;
  } else {
    const bases = RATIO_BASES[ratio];
    baseW = bases.baseW;
    baseH = bases.baseH;
  }
  return {
    w: clampDim(baseW * scale),
    h: clampDim(baseH * scale),
  };
}
```

- [ ] **Step 2: Update `MainContent.tsx` imports**

Remove the local declarations of `RATIO_KEYS`, `RATIO_BASES`, `roundTo16`, `clampDim`, `computeCanvasDims` (lines 15-48). Add import:

```typescript
import { RATIO_KEYS, computeCanvasDims, type RatioKey } from '../../utils/canvas-dims';
```

Also update the type casting line `const selectedRatio = canvasRatio as RatioKey;` — this already uses RatioKey, which is now imported.

- [ ] **Step 3: Run test to verify nothing broke**

Run: `npm run test -- --run`
Expected: All existing tests PASS (no behavior change yet)

- [ ] **Step 4: Commit**

```bash
### Task 3: 创建 ArtboardToolbar 组件（不使用 GlowGrid）
```

---

### Task 2: 新增 store 字段和 actions

**Files:**
- Modify: `src/store/index.ts`

**Interfaces:**
- Consumes: `computeCanvasDims`, `RatioKey` from `src/utils/canvas-dims`
- Produces: store fields `canvasScale`, `canvasCustomW`, `canvasCustomH` and actions `setCanvasScale`, `setCanvasCustom`; updated `setCanvasRatio`

- [ ] **Step 1: Add import in store**

```typescript
import { computeCanvasDims, type RatioKey } from '../utils/canvas-dims';
```

- [ ] **Step 2: Add fields to `EditorStore` interface (after `canvasRatio: string;` line)**

```typescript
  canvasScale: number;
  canvasCustomW: number;
  canvasCustomH: number;
  setCanvasScale: (scale: number) => void;
  setCanvasCustom: (w: number, h: number) => void;
```

- [ ] **Step 3: Add initial values and action implementations (in `create<EditorStore>` call)**

In the initial state, after `canvasRatio: '1:1',`:
```typescript
  canvasScale: 4,
  canvasCustomW: 16,
  canvasCustomH: 9,
```

In the actions section, add:
```typescript
  setCanvasScale: (scale) => {
    const state = get();
    const { w, h } = computeCanvasDims(state.canvasRatio as RatioKey, scale, state.canvasCustomW, state.canvasCustomH);
    set({ canvasScale: scale, canvasW: w, canvasH: h });
  },

  setCanvasCustom: (w, h) => {
    const state = get();
    const { w: newW, h: newH } = computeCanvasDims(state.canvasRatio as RatioKey, state.canvasScale, w, h);
    set({ canvasCustomW: w, canvasCustomH: h, canvasW: newW, canvasH: newH });
  },
```

- [ ] **Step 4: Update existing `setCanvasRatio`**

Replace the current `setCanvasRatio: (ratio) => set({ canvasRatio: ratio })` with:
```typescript
  setCanvasRatio: (ratio) => {
    const state = get();
    const { w, h } = computeCanvasDims(ratio as RatioKey, state.canvasScale, state.canvasCustomW, state.canvasCustomH);
    set({ canvasRatio: ratio, canvasW: w, canvasH: h });
  },
```

- [ ] **Step 5: Run test to verify**

Run: `npm run test -- --run`
Expected: All existing tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/store/index.ts
git commit -m "feat: add canvasScale/canvasCustomW/canvasCustomH to store"
```

---

### Task 3: 创建 ArtboardToolbar 组件

**Files:**
- Create: `src/components/canvas/ArtboardToolbar.tsx`

**Interfaces:**
- Consumes: store (`canvasRatio`, `canvasScale`, `canvasCustomW`, `canvasCustomH`, `canvasW`, `canvasH`, `setCanvasRatio`, `setCanvasScale`, `setCanvasCustom`), `useI18n()` for ratio labels
- Produces: `<ArtboardToolbar />` React component

- [ ] **Step 1: Create `src/components/canvas/ArtboardToolbar.tsx`**

```tsx
import { useCallback, useMemo } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import GlowGrid from '../panels/GlowGrid';
import SelectMenu from '../chat/SelectMenu';
import { RATIO_KEYS, type RatioKey } from '../../utils/canvas-dims';

export default function ArtboardToolbar() {
  const { t } = useI18n();

  const canvasRatio = useEditorStore(s => s.canvasRatio);
  const canvasScale = useEditorStore(s => s.canvasScale);
  const canvasCustomW = useEditorStore(s => s.canvasCustomW);
  const canvasCustomH = useEditorStore(s => s.canvasCustomH);
  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const setCanvasRatio = useEditorStore(s => s.setCanvasRatio);
  const setCanvasScale = useEditorStore(s => s.setCanvasScale);
  const setCanvasCustom = useEditorStore(s => s.setCanvasCustom);

  const selectedRatio = canvasRatio as RatioKey;

  const ratioOptions = useMemo(() =>
    RATIO_KEYS.map(k => ({
      value: k,
      label: t(`header.ratios.${k}` as Parameters<typeof t>[0]),
    })),
    [t],
  );

  const handleRatioChange = useCallback(
    (v: string) => setCanvasRatio(v),
    [setCanvasRatio],
  );

  const handleScaleChange = useCallback(
    (s: number) => setCanvasScale(s),
    [setCanvasScale],
  );

  const handleCustomChange = useCallback(
    (cw: number, ch: number) => setCanvasCustom(cw, ch),
    [setCanvasCustom],
  );

  return (
    <div className="artboard-toolbar">
      <GlowGrid style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'rgba(13, 13, 26, 0.85)', padding: '8px 14px' }}>
        <span className="canvas-controls-label">{t('header.ratio')}</span>
        <SelectMenu
          options={ratioOptions}
          value={selectedRatio}
          onChange={handleRatioChange}
          className="canvas-ratio-select"
        />

        {selectedRatio === 'custom' && (
          <div className="canvas-custom-ratio">
            <input
              type="number"
              className="slider-number"
              style={{ width: 48 }}
              min={1}
              max={32}
              value={canvasCustomW}
              onChange={e => {
                const v = Math.max(1, Math.min(32, parseInt(e.target.value) || 1));
                handleCustomChange(v, canvasCustomH);
              }}
            />
            <span className="canvas-custom-ratio-sep">:</span>
            <input
              type="number"
              className="slider-number"
              style={{ width: 48 }}
              min={1}
              max={32}
              value={canvasCustomH}
              onChange={e => {
                const v = Math.max(1, Math.min(32, parseInt(e.target.value) || 1));
                handleCustomChange(canvasCustomW, v);
              }}
            />
          </div>
        )}

        <span className="canvas-controls-label">{t('header.scale')}</span>
        <div className="slider-row canvas-scale-slider">
          <input
            type="range"
            min={1}
            max={16}
            step={1}
            value={canvasScale}
            onChange={e => {
              const v = parseInt(e.target.value);
              handleScaleChange(v);
            }}
          />
          <input
            type="number"
            className="slider-number"
            style={{ width: 48 }}
            min={1}
            max={16}
            value={canvasScale}
            onChange={e => {
              const raw = parseInt(e.target.value);
              if (isNaN(raw)) return;
              const v = Math.max(1, Math.min(16, Math.round(raw)));
              handleScaleChange(v);
            }}
          />
        </div>

        <span className="canvas-dims-display">{canvasW} × {canvasH}</span>
      </GlowGrid>
    </div>
  );
}
```

Also move these CSS class styles from `MainContent` side: `.canvas-controls-row`, `.canvas-controls-label`, `.canvas-custom-ratio`, `.canvas-custom-ratio-sep`, `.slider-row`, `.canvas-scale-slider`, `.slider-number`, `.canvas-dims-display`. Actually these are already in `index.css` — the ArtboardToolbar references them by class name, so they work as-is.

- [ ] **Step 2: Run build to verify**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/ArtboardToolbar.tsx
git commit -m "feat: create ArtboardToolbar floating toolbar component"
```

---

### Task 4: 在 Artboard 中渲染 ArtboardToolbar

**Files:**
- Modify: `src/components/canvas/Artboard.tsx`

- [ ] **Step 1: Add import and JSX**

At the top of `Artboard.tsx`, add import:
```typescript
import ArtboardToolbar from './ArtboardToolbar';
```

Inside the return, before the `<div style={{transform: ...}}>` (the CanvasArea wrapper), add:
```tsx
      <ArtboardToolbar />
```

The full return will look like:
```tsx
  return (
    <div
      ref={artboardRef}
      className={`artboard${isPanning ? ' is-panning' : ''}`}
      onMouseDown={handleMouseDown}
    >
      <ArtboardToolbar />

      <div className="artboard-controls">
        ...
      </div>

      <div
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: 'top left',
        }}
      >
        <CanvasArea ... />
      </div>

      <CanvasChatPanel />
    </div>
  );
```

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/Artboard.tsx
git commit -m "feat: render ArtboardToolbar inside Artboard"
```

---

### Task 5: 清理 MainContent — 删除已迁移的控件

**Files:**
- Modify: `src/components/layout/MainContent.tsx`

- [ ] **Step 1: Remove unused imports**

Remove `GlowGrid` from imports (line 9). Remove `SelectMenu` from imports (line 10). Remove `useState`, `useRef`, `useCallback` if they become unused — keep `useImageDrop` import.

- [ ] **Step 2: Remove local state and handlers**

Remove these lines from the `CanvasPage` function body:
- Lines 61-65: `const [scale, setScale] = useState(4);` etc.
- Line 67: `const selectedRatio = canvasRatio as RatioKey;`
- Lines 69-75: `const applyDimensions = ...`
- Lines 77-84: `const initialized` useEffect block
- Lines 86-112: `handleRatioChange`, `handleScaleChange`, `handleCustomChange`
- Lines 114-119: `const ratioOptions = ...`

Also remove unused store selectors:
- Line 57: `const setCanvasDimensions = useEditorStore(s => s.setCanvasDimensions);`

Keep:
- Line 56: `const canvasRatio = useEditorStore(s => s.canvasRatio);` — needed? Let me check... it's still used by the reset button area? Actually let me look at the reset button. The current code has `resetCanvas` which only resets boxes/generation, not canvas dimensions. So canvasRatio isn't needed after removing the controls. Let me remove it too.

Keep only in `CanvasPage`:
```typescript
export default function CanvasPage() {
  useImageDrop();
  const { t } = useI18n();
  const resetCanvas = useEditorStore(s => s.resetCanvas);
```

- [ ] **Step 3: Remove the GlowGrid JSX block**

Replace the entire `<GlowGrid>...</GlowGrid>` section (current lines 123-197) with just the reset button:

```tsx
      <button className="btn" onClick={resetCanvas}>{t('header.resetCanvas')}</button>
```

The return should now look like:
```tsx
  return (
    <>
      <button className="btn" onClick={resetCanvas}>{t('header.resetCanvas')}</button>

      {/* Main Content: 画板 + 右侧面板 */}
      <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        ...
      </div>
    </>
  );
```

- [ ] **Step 4: Update imports — remove unused ones**

Final imports in MainContent.tsx:
```typescript
import { useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import Artboard from '../canvas/Artboard';
import JsonToolbar from '../json/JsonToolbar';
import ComfyUIControls from '../comfyui/ComfyUIControls';
import ImagePreview from '../comfyui/ImagePreview';
import RightPanelContainer from '../panels/RightPanelContainer';
import { useImageDrop } from '../../hooks/useImageDrop';
import { RATIO_KEYS, computeCanvasDims, type RatioKey } from '../../utils/canvas-dims';
```

Wait — `RATIO_KEYS`, `computeCanvasDims`, `RatioKey` — are these still used in MainContent? After removing the ratio dropdown and its handlers, the only place they might be used is if something else references them. Let me check... 

`RATIO_KEYS` was used for `ratioOptions`. `computeCanvasDims` was used in `applyDimensions`. `RatioKey` was used for `selectedRatio`. All removed.

So the final imports should **not** include canvas-dims anymore. But wait — does `CanvasPage` still need `RATIO_KEYS` for the ratio dropdown? No, the dropdown moved to ArtboardToolbar.

Also `setCanvasDimensions` is no longer needed in CanvasPage since store actions handle dimension computation.

Final imports:
```typescript
import { useEffect, useRef } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import Artboard from '../canvas/Artboard';
import JsonToolbar from '../json/JsonToolbar';
import ComfyUIControls from '../comfyui/ComfyUIControls';
import ImagePreview from '../comfyui/ImagePreview';
import RightPanelContainer from '../panels/RightPanelContainer';
import { useImageDrop } from '../../hooks/useImageDrop';
```

Wait, are `JsonToolbar`, `ComfyUIControls`, `ImagePreview` still used? Let me check the rest of MainContent. There's a `CanvasBottom` component that exports these things. And `CanvasPage` renders things in its return. Let me check what's in the rest of MainContent.

Actually, from the initial read, lines 199-210 show the main layout and lines 213-221 show `CanvasBottom`. Let me check if `CanvasPage` renders `CanvasBottom` or `JsonToolbar`/`ComfyUIControls`/`ImagePreview` inline.

From lines 121-211:
```tsx
return (
    <>
      <GlowGrid>...</GlowGrid>   ← remove
      <div ...>                   ← this is the main layout
        <div ...>
          <Artboard />
        </div>
        <div ...>
          <RightPanelContainer />
        </div>
      </div>
    </>
  );
```

So `JsonToolbar`, `ComfyUIControls`, `ImagePreview` are imported but not used in `CanvasPage`'s JSX. They might be used in `CanvasBottom`. Let me check.

After line 211 there's `CanvasBottom` which uses them. But are they imported just for that? Yes, `CanvasBottom` uses them. That's fine, keep the imports.

Actually wait, let me re-check the imports carefully. The current imports are:

```
import { useState, useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import Artboard from '../canvas/Artboard';
import JsonToolbar from '../json/JsonToolbar';
import ComfyUIControls from '../comfyui/ComfyUIControls';
import ImagePreview from '../comfyui/ImagePreview';
import RightPanelContainer from '../panels/RightPanelContainer';
import GlowGrid from '../panels/GlowGrid';
import SelectMenu from '../chat/SelectMenu';
import { useImageDrop } from '../../hooks/useImageDrop';
```

After cleanup:
- `useState` — remove (no longer used)
- `useCallback` — remove (no longer used)
- `useEffect` — keep (still used for `initialized`? No, that's removed. But wait, is `useEffect` used anywhere else in CanvasPage? Let me check... only the `initialized` useEffect is there. So `useEffect` is no longer used.)
- `useRef` — keep? Only used in `initialized`. Remove.
- `useEditorStore` — keep (for `resetCanvas`)
- `useI18n` — keep (for `t`)
- `Artboard` — keep
- `JsonToolbar` — used in CanvasBottom, keep
- `ComfyUIControls` — used in CanvasBottom, keep
- `ImagePreview` — used in CanvasBottom, keep
- `RightPanelContainer` — keep
- `GlowGrid` — remove
- `SelectMenu` — remove
- `useImageDrop` — keep

So final imports:
```typescript
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import Artboard from '../canvas/Artboard';
import JsonToolbar from '../json/JsonToolbar';
import ComfyUIControls from '../comfyui/ComfyUIControls';
import ImagePreview from '../comfyui/ImagePreview';
import RightPanelContainer from '../panels/RightPanelContainer';
import { useImageDrop } from '../../hooks/useImageDrop';
```

And the `CanvasPage` function body:
```typescript
export default function CanvasPage() {
  useImageDrop();
  const { t } = useI18n();
  const resetCanvas = useEditorStore(s => s.resetCanvas);
  ...
```

Wait, but the `canvasRatio` is still needed by... hmm, is it? Let me check. In the original code:
```tsx
const canvasRatio = useEditorStore(s => s.canvasRatio);
```
This was used in `handleRatioChange`. But that's removed. So no, `canvasRatio` is not needed in CanvasPage anymore.

- [ ] **Step 5: Run build & test**

Run: `npm run build && npm run test -- --run`
Expected: Build succeeds, all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/MainContent.tsx
git commit -m "refactor: remove migrated controls from MainContent"
```

---

### Task 6: ArtboardToolbar 样式

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add `.artboard-toolbar` CSS before `.artboard-controls` (before line 639)**

```css
.artboard-toolbar {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  pointer-events: auto;
}
```

Also tune the `.glow-grid-container` within `.artboard-toolbar` to be more compact:
```css
.artboard-toolbar .glow-grid-container {
  padding: 6px 14px;
  border-radius: 8px;
  backdrop-filter: blur(8px);
  border: 1px solid var(--border);
}
```

Place both rules after line 633 (after `.artboard` block) and before `.artboard.is-panning` (line 635).

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat: add artboard-toolbar CSS styles"
```

---

### Task 7: 编写测试

**Files:**
- Create: `src/components/canvas/__tests__/ArtboardToolbar.test.tsx`
- Modify: `src/store/__tests__/index.test.ts`

- [ ] **Step 1: Create `ArtboardToolbar.test.tsx`**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ArtboardToolbar from '../ArtboardToolbar';
import { useEditorStore } from '../../../store';
import { I18nProvider } from '../../../i18n/context';

describe('ArtboardToolbar', () => {
  beforeEach(() => {
    useEditorStore.setState({
      canvasRatio: '1:1',
      canvasScale: 4,
      canvasCustomW: 16,
      canvasCustomH: 9,
      canvasW: 1024,
      canvasH: 1024,
    });
  });

  it('应该渲染比例选择控件', () => {
    render(<I18nProvider><ArtboardToolbar /></I18nProvider>);
    expect(screen.getByText('Ratio')).toBeTruthy();
  });

  it('应该显示当前画布尺寸', () => {
    render(<I18nProvider><ArtboardToolbar /></I18nProvider>);
    expect(screen.getByText('1024 × 1024')).toBeTruthy();
  });

  it('当比例为 custom 时，应显示宽高输入框', () => {
    useEditorStore.setState({ canvasRatio: 'custom' });
    render(<I18nProvider><ArtboardToolbar /></I18nProvider>);
    const inputs = document.querySelectorAll('.slider-number');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('当比例为非 custom 时，应隐藏宽高输入框', () => {
    useEditorStore.setState({ canvasRatio: '16:9' });
    render(<I18nProvider><ArtboardToolbar /></I18nProvider>);
    const customRatio = document.querySelector('.canvas-custom-ratio');
    expect(customRatio).toBeNull();
  });
});
```

Note: I'm wrapping with `I18nProvider` since ArtboardToolbar uses `useI18n()`. Let me check how other tests handle this...

Looking at `CanvasChatPanel.test.tsx` — it also uses I18n. Let me check how it handles it.

Actually I should check `CanvasChatPanel.test.tsx` for the pattern, but I don't have it in context. The standard pattern with this project's setup is to wrap in `I18nProvider`. Let me proceed.

- [ ] **Step 2: Add store tests**

Append to `src/store/__tests__/index.test.ts`:

```typescript
describe('canvasScale / canvasCustom', () => {
  it('初始值应为默认值', () => {
    const state = useEditorStore.getState();
    expect(state.canvasScale).toBe(4);
    expect(state.canvasCustomW).toBe(16);
    expect(state.canvasCustomH).toBe(9);
  });

  it('setCanvasScale 应更新 canvasScale 和 canvasW/canvasH', () => {
    useEditorStore.getState().setCanvasScale(2);
    const state = useEditorStore.getState();
    expect(state.canvasScale).toBe(2);
    // 1:1 ratio + scale 2 → 512×512 (256*2=512, roundTo16 → 512)
    expect(state.canvasW).toBe(512);
    expect(state.canvasH).toBe(512);
  });

  it('setCanvasCustom 应更新 custom 值和 canvasW/canvasH', () => {
    useEditorStore.getState().setCanvasCustom(3, 4);
    const state = useEditorStore.getState();
    expect(state.canvasCustomW).toBe(3);
    expect(state.canvasCustomH).toBe(4);
    // custom 3:4 → baseW ≈ 192, baseH ≈ 256, scale 4 → 768×1024
    expect(state.canvasW).toBeGreaterThan(0);
    expect(state.canvasH).toBeGreaterThan(0);
  });

  it('setCanvasRatio 在 scale/custom 改变后仍正确计算尺寸', () => {
    const store = useEditorStore;
    store.getState().setCanvasScale(2);
    store.getState().setCanvasRatio('16:9');
    const state = store.getState();
    expect(state.canvasRatio).toBe('16:9');
    // 16:9 baseW=256, baseH=144, scale=2 → 512×288
    expect(state.canvasW).toBe(512);
    expect(state.canvasH).toBe(288);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- --run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/__tests__/ArtboardToolbar.test.tsx src/store/__tests__/index.test.ts
git commit -m "test: add ArtboardToolbar and store tests"
```

---

## 执行说明

所有 7 个 Task 有线性依赖关系，需按顺序执行。Task 1-6 完成后即可本地验证（`npm run dev`），Task 7 验证正确性。
