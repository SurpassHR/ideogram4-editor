# 浮动图层面板 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在画布右上角添加浮动图层面板，解决重叠 box 无法通过鼠标选中的问题。选中 box 后自动淡化其他 box 以增强可见性。

**Architecture:** 画布内绝对定位浮动面板（按钮 + 面板一体组件），Zustand store 新增 `isLayerPanelOpen` 状态；BoundingBox 根据 store 选中状态动态应用 dim 样式；复用现有 CanvasChatPanel 的 CSS 变量体系。

**Tech Stack:** React 19 + TypeScript + Zustand 5 + Vitest + @testing-library/react + Playwright

## Global Constraints

- 不修改 CanvasChatPanel 的布局逻辑
- 不添加第三方 UI 组件库
- 图标必须使用 `src/components/ui/icons.tsx` 中的 SVG 组件（新增 IconLayers）
- i18n 翻译条目按现有模式添加到 `src/i18n/translations.ts`
- 所有新增文件遵循现有代码风格（纯自定义 CSS + 语义类）
- 禁止使用 emoji 字符替代图标组件

---

### Task 1: Store — 新增 isLayerPanelOpen 状态

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/store/__tests__/index.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  // in EditorStore interface
  isLayerPanelOpen: boolean;
  toggleLayerPanel: () => void;
  ```

- [ ] **Step 1: 在 store 接口中添加字段**

在 `src/store/index.ts` 的 `EditorStore` 接口声明中（在 `gistToken` / `gistId` 相关字段附近），新增：

```typescript
  isLayerPanelOpen: boolean;
  toggleLayerPanel: () => void;
```

- [ ] **Step 2: 在初始状态中添加初始值**

```typescript
  isLayerPanelOpen: false,
```

- [ ] **Step 3: 在 actions 中添加 toggleLayerPanel 实现**

```typescript
  toggleLayerPanel: () => set(state => ({ isLayerPanelOpen: !state.isLayerPanelOpen })),
```

- [ ] **Step 4: 编写 store 测试**

在 `src/store/__tests__/index.test.ts` 末尾追加：

```typescript
describe('layerPanel', () => {
  it('isLayerPanelOpen 初始应为 false', () => {
    expect(useEditorStore.getState().isLayerPanelOpen).toBe(false);
  });

  it('toggleLayerPanel 应切换 isLayerPanelOpen', () => {
    const store = useEditorStore.getState();
    store.toggleLayerPanel();
    expect(useEditorStore.getState().isLayerPanelOpen).toBe(true);
    store.toggleLayerPanel();
    expect(useEditorStore.getState().isLayerPanelOpen).toBe(false);
  });
});
```

- [ ] **Step 5: 运行测试**

```bash
npm run test -- --run
```
Expected: All tests PASS

---

### Task 2: 添加 IconLayers 图标

**Files:**
- Modify: `src/components/ui/icons.tsx`

- [ ] **Step 1: 在 icons.tsx 末尾添加 IconLayers 组件**

在 `IconImagePlus` 后面新增：

```typescript
/** 图层堆叠 — 图层面板切换 */
export const IconLayers = createIcon(
  <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
    <rect x="2" y="6" width="20" height="14" rx="2" />
    <path d="M6 6V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
    <line x1="2" y1="10" x2="22" y2="10" />
  </g>,
);
```

设计说明：三层图标 — 底部大矩形表示底层画布，中间横线分隔，上层小矩形表示堆叠的 box 图层。

- [ ] **Step 2: 运行类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: No TypeScript errors

---

### Task 3: 创建 LayerPanel 组件

**Files:**
- Create: `src/components/canvas/LayerPanel.tsx`

- [ ] **Step 1: 创建 LayerPanel.tsx**

```tsx
import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import { IconClose, IconLayers } from '../ui/icons';

export default function LayerPanel() {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);

  const boxes = useEditorStore(s => s.boxes);
  const selectedBoxIds = useEditorStore(s => s.selectedBoxIds);
  const selectBox = useEditorStore(s => s.selectBox);
  const isLayerPanelOpen = useEditorStore(s => s.isLayerPanelOpen);
  const toggleLayerPanel = useEditorStore(s => s.toggleLayerPanel);

  // 点击面板外部关闭
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      const toggleBtn = document.querySelector('.layer-panel-toggle');
      if (toggleBtn && toggleBtn.contains(e.target as Node)) return;
      toggleLayerPanel();
    }
  }, [toggleLayerPanel]);

  useEffect(() => {
    if (isLayerPanelOpen) {
      // 延迟添加以避免当前点击事件触发关闭
      const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isLayerPanelOpen, handleClickOutside]);

  // Escape 关闭
  useEffect(() => {
    if (!isLayerPanelOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleLayerPanel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isLayerPanelOpen, toggleLayerPanel]);

  // 反转 boxes 以使上层 box 在列表顶部
  const layerItems = [...boxes].reverse();

  return (
    <div className="layer-panel-wrapper" ref={panelRef}>
      {/* 展开按钮 */}
      <button
        className={`layer-panel-toggle${boxes.length === 0 ? ' disabled' : ''}`}
        onClick={toggleLayerPanel}
        title={t('layerPanel.toggle')}
        disabled={boxes.length === 0}
      >
        <IconLayers size={16} />
      </button>

      {/* 浮动面板 */}
      {isLayerPanelOpen && (
        <div className="layer-panel">
          {/* 标题栏 */}
          <div className="layer-panel-header">
            <span className="layer-panel-header-title">
              {t('layerPanel.title')} ({boxes.length})
            </span>
            <button
              className="layer-panel-close"
              onClick={toggleLayerPanel}
              title={t('layerPanel.close')}
            >
              <IconClose size={12} />
            </button>
          </div>

          {/* 列表 */}
          <div className="layer-panel-list">
            {layerItems.length === 0 ? (
              <div className="layer-panel-empty">{t('layerPanel.empty')}</div>
            ) : (
              layerItems.map(box => {
                const isSelected = selectedBoxIds.includes(box.id);
                const color = box.colors?.[0] || '#666';
                const label = box.text || box.id;
                return (
                  <div
                    key={box.id}
                    className={`layer-panel-item${isSelected ? ' selected' : ''}`}
                    onClick={() => selectBox(box.id)}
                  >
                    <span
                      className="layer-panel-item-dot"
                      style={{ backgroundColor: color }}
                    />
                    <span className="layer-panel-item-label">{label}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 运行 build**

```bash
npm run build
```
Expected: Build succeeds

---

### Task 4: LayerPanel 样式

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: 在 index.css 末尾添加 LayerPanel 样式**

```css
/* ─── 浮动图层面板 ───────────────────────────────── */
.layer-panel-wrapper {
  position: absolute;
  top: 50px;
  right: 10px;
  z-index: 50;
  pointer-events: auto;
}

.layer-panel-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: rgba(22, 22, 48, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(124, 92, 252, 0.2);
  color: var(--text);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.layer-panel-toggle:hover {
  background: rgba(30, 30, 58, 0.9);
  border-color: rgba(124, 92, 252, 0.4);
}

.layer-panel-toggle.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.layer-panel {
  position: absolute;
  top: 40px;
  right: 0;
  width: 220px;
  max-height: 300px;
  background: rgba(22, 22, 48, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(124, 92, 252, 0.25);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
  animation: layer-panel-in 0.15s ease-out;
}

@keyframes layer-panel-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.layer-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.layer-panel-header-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

.layer-panel-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.layer-panel-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

.layer-panel-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.layer-panel-empty {
  padding: 20px 10px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}

.layer-panel-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  transition: background 0.12s ease;
  user-select: none;
}

.layer-panel-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.layer-panel-item.selected {
  background: rgba(124, 92, 252, 0.15);
}

.layer-panel-item-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.layer-panel-item-label {
  flex: 1;
  font-size: 12px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 2: 运行 build**

```bash
npm run build
```
Expected: Build succeeds

---

### Task 5: 在 Artboard 中集成 LayerPanel

**Files:**
- Modify: `src/components/canvas/Artboard.tsx`

- [ ] **Step 1: 在 Artboard.tsx 中添加 import**

```typescript
import LayerPanel from './LayerPanel';
```

- [ ] **Step 2: 在 JSX 中渲染 LayerPanel**

在 CanvasChatPanel 之前或之后添加：

```tsx
      <LayerPanel />
```

完整返回结构：

```tsx
  return (
    <div
      ref={artboardRef}
      className={`artboard${isPanning ? ' is-panning' : ''}`}
      onMouseDown={handleMouseDown}
    >
      <ArtboardToolbar />

      <div className="artboard-controls">...</div>

      <div style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})`, transformOrigin: 'top left' }}>
        <CanvasArea ... />
      </div>

      <LayerPanel />          {/* ← 新增 */}
      <CanvasChatPanel />
      <LayoutQualityDialog ... />
    </div>
  );
```

- [ ] **Step 3: 运行 build**

```bash
npm run build
```
Expected: Build succeeds

---

### Task 6: BoundingBox 淡化效果

**Files:**
- Modify: `src/components/canvas/BoundingBox.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: 在 BoundingBox.tsx 中添加 dimmed class**

在 BoundingBox 组件中获取 `selectedBoxIds`：

```tsx
const selectedBoxIds = useEditorStore(s => s.selectedBoxIds);
```

在返回的 div className 中根据选中状态添加 `dimmed`：

```tsx
const hasSelection = selectedBoxIds.length > 0;
const isSelected = isSelected;  // 来自 props

<div
  className={`bounding-box${isSelected ? ' selected' : ''}${hasSelection && !isSelected ? ' dimmed' : ''}`}
  ...
>
```

完整修改：

```tsx
// 在组件顶部获取 store 状态（在已有 hooks 后面）
const selectedBoxIds = useEditorStore(s => s.selectedBoxIds);
const hasSelection = selectedBoxIds.length > 0;
const isDimmed = hasSelection && !props.isSelected;
```

修改 className 生成：

```typescript
const className = `bounding-box${
  isEditing ? ' editing' : ''
}${props.isSelected ? ' selected' : ''}${isDimmed ? ' dimmed' : ''}`;
```

- [ ] **Step 2: 在 CSS 中添加 `.bounding-box.dimmed` 规则**

在 `src/index.css` 的 bounding-box 相关样式区域添加：

```css
.bounding-box.dimmed {
  opacity: 0.25;
  transition: opacity 0.2s ease;
}

.bounding-box.dimmed:hover {
  opacity: 0.5;
}
```

- [ ] **Step 3: 运行 build**

```bash
npm run build
```
Expected: Build succeeds

---

### Task 7: i18n 翻译条目

**Files:**
- Modify: `src/i18n/translations.ts`

- [ ] **Step 1: 在 translations.ts 中添加 layerPanel 区域**

在 `chat` 区域之后，`artboard` 区域之前（或其他合适的 UI 区域分组位置），新增：

```typescript
  layerPanel: {
    title: 'Layers',
    title_zh: '图层',
    toggle: 'Toggle Layer Panel',
    toggle_zh: '图层面板',
    close: 'Close',
    close_zh: '关闭',
    empty: 'No boxes',
    empty_zh: '暂无边界框',
  },
```

- [ ] **Step 2: 运行 type check**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```
Expected: No TypeScript errors

---

### Task 8: 构建验证

**Files:**
- (全量构建/测试)

- [ ] **Step 1: 运行全量测试 + 构建**

```bash
npm run test -- --run && npm run build
```
Expected: All tests PASS, Build succeeds

- [ ] **Step 2: Playwright 视觉验证**

```bash
# 确保 dev server 已运行，如未运行则启动
npx vite --host 0.0.0.0 &
sleep 3

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}" && \
export PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh" && \
xvfb-run --server-args="-screen 0 1280x1024x24" sh <<'SCRIPT'
cd /media/hr/Data/Codes/ideogram4-editor
"$PWCLI" open http://localhost:5173 --headed
sleep 6
"$PWCLI" console
"$PWCLI" screenshot /tmp/verify-layer-panel.png
"$PWCLI" close
SCRIPT
```
Expected: 控制台无致命错误，页面正常渲染，LayerPanel 切换按钮可见
