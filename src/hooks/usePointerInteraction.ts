import { useCallback, useRef, useEffect, useState } from 'react';
import type { InteractionMode } from '../types';
import type { InteractionState } from '../types';
import { useEditorStore, hasInternalClipboard } from '../store';

interface UsePointerInteractionOptions {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panX: number;
  panY: number;
  screenToCanvas: (sx: number, sy: number) => { x: number; y: number };
}

function isTextEntryElement(el: HTMLElement | null): boolean {
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  );
}

function blurStaleTextEntryFocus(target: HTMLElement) {
  if (isTextEntryElement(target)) return;
  const active = document.activeElement as HTMLElement | null;
  if (active && active !== document.body && isTextEntryElement(active)) {
    active.blur();
  }
}

export function usePointerInteraction({ canvasRef, screenToCanvas }: UsePointerInteractionOptions) {
  const interactionRef = useRef<InteractionState>({
    mode: 'idle',
    startX: 0,
    startY: 0,
    dragStartX: 0,
    dragStartY: 0,
    initialBoxX: 0,
    initialBoxY: 0,
    initialBoxW: 0,
    initialBoxH: 0,
    currentBoxElement: null,
    pendingBoxId: null,
    pointerMoved: false,
    clickTargetId: null,
    lastClickTime: 0,
    lastClickBoxId: null,
    dragBoxIds: [],
    initialDragBoxes: [],
  });

  const boxRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [drawingGhost, setDrawingGhost] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [marqueeGhost, setMarqueeGhost] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragPreviewOffset, setDragPreviewOffset] = useState<{ boxIds: string[]; dx: number; dy: number } | null>(null);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('idle');
  const [altPressed, setAltPressed] = useState(false);

  const addBox = useEditorStore(s => s.addBox);
  const selectBox = useEditorStore(s => s.selectBox);
  const selectBoxes = useEditorStore(s => s.selectBoxes);
  const toggleBoxSelection = useEditorStore(s => s.toggleBoxSelection);
  const clearSelection = useEditorStore(s => s.clearSelection);
  const updateBox = useEditorStore(s => s.updateBox);
  const setEditingBoxId = useEditorStore(s => s.setEditingBoxId);

  const getPointerPos = useCallback((e: PointerEvent | React.PointerEvent): { x: number; y: number } => {
    return screenToCanvas(e.clientX, e.clientY);
  }, [screenToCanvas]);

  const registerBoxRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) {
      boxRefs.current.set(id, el);
    } else {
      boxRefs.current.delete(id);
    }
  }, []);

  const getRectFromPoints = useCallback((startX: number, startY: number, endX: number, endY: number) => {
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    return {
      x,
      y,
      w: Math.abs(endX - startX),
      h: Math.abs(endY - startY),
    };
  }, []);

  const boxesOverlap = useCallback((
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ) => !(
    a.x + a.w < b.x ||
    b.x + b.w < a.x ||
    a.y + a.h < b.y ||
    b.y + b.h < a.y
  ), []);

  const updateMarquee = useCallback((x: number, y: number) => {
    const ir = interactionRef.current;
    ir.dragStartX = x;
    ir.dragStartY = y;
    const rect = getRectFromPoints(ir.startX, ir.startY, x, y);
    setMarqueeGhost(rect);
  }, [getRectFromPoints]);

  const beginSelectionGesture = useCallback((e: React.PointerEvent, hitBoxId: string | null) => {
    const pos = getPointerPos(e);
    const ir = interactionRef.current;
    ir.mode = 'pendingSelection';
    setInteractionMode('pendingSelection');
    ir.startX = pos.x;
    ir.startY = pos.y;
    ir.dragStartX = pos.x;
    ir.dragStartY = pos.y;
    ir.pointerMoved = false;
    ir.clickTargetId = hitBoxId;
    ir.currentBoxElement = null;
    setDragPreviewOffset(null);
    setMarqueeGhost(null);
  }, [getPointerPos]);

  // 进入 drawing 模式：在按下位置创建 ghost div，由 pointermove 更新尺寸、pointerup 落盘
  const startDrawing = useCallback((e: React.PointerEvent) => {
    const pos = getPointerPos(e);
    const ir = interactionRef.current;
    ir.mode = 'drawing';
    setInteractionMode('drawing');
    ir.startX = pos.x;
    ir.startY = pos.y;
    setDragPreviewOffset(null);

    const ghost = document.createElement('div');
    ghost.className = 'bounding-box';
    ghost.style.left = `${pos.x}px`;
    ghost.style.top = `${pos.y}px`;
    ghost.style.width = '0px';
    ghost.style.height = '0px';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '5';
    canvasRef.current!.appendChild(ghost);
    ir.currentBoxElement = ghost;

    setDrawingGhost({ x: pos.x, y: pos.y, w: 0, h: 0 });
  }, [canvasRef, getPointerPos]);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    blurStaleTextEntryFocus(target);
    const boxEl = target.closest('.bounding-box') as HTMLDivElement | null;
    const isSelectionModifier = e.ctrlKey || e.metaKey || e.shiftKey;

    // Alt 修饰键：忽略命中检测（resize-handle / bounding-box），直接进入 drawing 模式，
    // 允许在已有 box 重叠区域绘制创建新 box（addBox 追加到 boxes 末尾即最上层）
    if (e.altKey) {
      startDrawing(e);
      return;
    }

    if (isSelectionModifier) {
      e.preventDefault();
      e.stopPropagation();
      beginSelectionGesture(e, boxEl?.id || null);
      return;
    }

    if (target.closest('.resize-handle')) {
      if (!boxEl) return;
      e.preventDefault();
      e.stopPropagation();

      const pos = getPointerPos(e);
      const ir = interactionRef.current;
      ir.mode = 'resizing';
      setInteractionMode('resizing');
      ir.dragStartX = pos.x;
      ir.dragStartY = pos.y;
      ir.initialBoxW = parseFloat(boxEl.style.width) || 0;
      ir.initialBoxH = parseFloat(boxEl.style.height) || 0;
      ir.currentBoxElement = boxEl;
      return;
    }

    if (boxEl) {
      if (!boxEl) return;
      e.preventDefault();
      e.stopPropagation();

      const pos = getPointerPos(e);
      const state = useEditorStore.getState();
      const shouldDragGroup = state.selectedBoxIds.length > 1 && state.selectedBoxIds.includes(boxEl.id);
      const dragBoxIds = shouldDragGroup ? [...state.selectedBoxIds] : [boxEl.id];
      const ir = interactionRef.current;
      ir.mode = 'dragging';
      setInteractionMode('dragging');
      ir.dragStartX = pos.x;
      ir.dragStartY = pos.y;
      ir.initialBoxX = parseFloat(boxEl.style.left) || 0;
      ir.initialBoxY = parseFloat(boxEl.style.top) || 0;
      ir.currentBoxElement = boxEl;
      ir.pointerMoved = false;
      ir.clickTargetId = boxEl.id;
      ir.dragBoxIds = dragBoxIds;
      ir.initialDragBoxes = dragBoxIds.map(id => {
        const el = boxRefs.current.get(id);
        return {
          id,
          x: el ? parseFloat(el.style.left) || 0 : state.boxes.find(b => b.id === id)?.x || 0,
          y: el ? parseFloat(el.style.top) || 0 : state.boxes.find(b => b.id === id)?.y || 0,
        };
      });
      setDragPreviewOffset(null);

      if (!shouldDragGroup) {
        selectBox(boxEl.id);
      }
      return;
    }

    if (target === canvasRef.current || (target as HTMLElement).id === 'canvas-inner') {
      startDrawing(e);
    }
  }, [beginSelectionGesture, canvasRef, getPointerPos, selectBox, startDrawing]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    const ir = interactionRef.current;
    if (ir.mode === 'pendingSelection' || ir.mode === 'marqueeSelect') {
      const pos = getPointerPos(e);
      const dx = pos.x - ir.startX;
      const dy = pos.y - ir.startY;
      if (ir.mode === 'pendingSelection') {
        if (Math.abs(dx) <= 4 && Math.abs(dy) <= 4) return;
        ir.mode = 'marqueeSelect';
        setInteractionMode('marqueeSelect');
        ir.pointerMoved = true;
      }
      updateMarquee(pos.x, pos.y);
      return;
    }

    if (ir.mode !== 'drawing') return;
    if (!ir.currentBoxElement) return;

    const pos = getPointerPos(e);
    let x = ir.startX;
    let y = ir.startY;
    let w = pos.x - ir.startX;
    let h = pos.y - ir.startY;

    if (w < 0) { x = pos.x; w = -w; }
    if (h < 0) { y = pos.y; h = -h; }

    ir.currentBoxElement.style.left = `${x}px`;
    ir.currentBoxElement.style.top = `${y}px`;
    ir.currentBoxElement.style.width = `${w}px`;
    ir.currentBoxElement.style.height = `${h}px`;

    setDrawingGhost({ x, y, w, h });
  }, [getPointerPos, updateMarquee]);

  // Window-level listeners for drag/resize (pointer-escape support) and pointerup
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const ir = interactionRef.current;
      if (ir.mode !== 'dragging' && ir.mode !== 'resizing' && ir.mode !== 'pendingSelection' && ir.mode !== 'marqueeSelect') return;

      const { x, y } = screenToCanvas(e.clientX, e.clientY);

      if (ir.mode === 'pendingSelection' || ir.mode === 'marqueeSelect') {
        const dx = x - ir.startX;
        const dy = y - ir.startY;
        if (ir.mode === 'pendingSelection') {
          if (Math.abs(dx) <= 4 && Math.abs(dy) <= 4) return;
          ir.mode = 'marqueeSelect';
          setInteractionMode('marqueeSelect');
          ir.pointerMoved = true;
        }
        updateMarquee(x, y);
        return;
      }

      if (!ir.currentBoxElement) return;

      if (ir.mode === 'dragging') {
        const dx = x - ir.dragStartX;
        const dy = y - ir.dragStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          ir.pointerMoved = true;
        }
        if (ir.dragBoxIds.length > 1) {
          ir.initialDragBoxes.forEach(initial => {
            const el = boxRefs.current.get(initial.id);
            if (!el) return;
            el.style.left = `${initial.x + dx}px`;
            el.style.top = `${initial.y + dy}px`;
          });
          setDragPreviewOffset({ boxIds: [...ir.dragBoxIds], dx, dy });
        } else {
          const newX = ir.initialBoxX + dx;
          const newY = ir.initialBoxY + dy;
          ir.currentBoxElement.style.left = `${newX}px`;
          ir.currentBoxElement.style.top = `${newY}px`;
          // 实时更新 store，使 BoundingBox 的 clip-path 和虚线样式即时响应
          updateBox(ir.currentBoxElement.id, { x: newX, y: newY });
          setDragPreviewOffset(null);
        }
      } else if (ir.mode === 'resizing') {
        const newW = Math.max(10, ir.initialBoxW + (x - ir.dragStartX));
        const newH = Math.max(10, ir.initialBoxH + (y - ir.dragStartY));
        ir.currentBoxElement.style.width = `${newW}px`;
        ir.currentBoxElement.style.height = `${newH}px`;
        // 实时更新 store，使 BoundingBox 的 clip-path 和虚线样式即时响应
        updateBox(ir.currentBoxElement.id, { w: newW, h: newH });
      }
    };

    const onPointerUp = () => {
      const ir = interactionRef.current;

      if (ir.mode === 'pendingSelection') {
        if (ir.clickTargetId) {
          toggleBoxSelection(ir.clickTargetId);
        }
        setMarqueeGhost(null);
      } else if (ir.mode === 'marqueeSelect') {
        const rect = marqueeGhost ?? getRectFromPoints(ir.startX, ir.startY, ir.dragStartX, ir.dragStartY);
        const ids = useEditorStore.getState().boxes
          .filter(box => boxesOverlap(rect, box))
          .map(box => box.id);
        selectBoxes(ids);
        setMarqueeGhost(null);
      } else if (ir.mode === 'drawing' && ir.currentBoxElement) {
        const el = ir.currentBoxElement;
        const x = parseFloat(el.style.left) || 0;
        const y = parseFloat(el.style.top) || 0;
        const w = parseFloat(el.style.width) || 0;
        const h = parseFloat(el.style.height) || 0;
        el.remove();

        if (w >= 10 && h >= 10) {
          addBox({ x, y, w, h, mode: 'obj', text: '', desc: '', colors: [], imageDataUrl: null, imageRole: 'both' });
        } else {
          clearSelection();
        }
        setDrawingGhost(null);
      } else if (ir.mode === 'dragging' && ir.currentBoxElement) {
        const el = ir.currentBoxElement;
        if (!ir.pointerMoved) {
          const now = Date.now();
          // 双击检测：同一 box 在 300ms 内被点击两次 → 进入文字编辑模式
          if (ir.lastClickBoxId === el.id && now - ir.lastClickTime < 300) {
            selectBox(el.id);
            setEditingBoxId(el.id);
            ir.lastClickTime = 0;
            ir.lastClickBoxId = null;
          } else {
            // 单击：不打开 Chat，仅记录点击时间用于双击检测
            ir.lastClickTime = now;
            ir.lastClickBoxId = el.id;
          }
        } else if (ir.dragBoxIds.length > 1) {
          const positions = new Map(ir.dragBoxIds.map(id => {
            const boxEl = boxRefs.current.get(id);
            return [id, {
              x: boxEl ? parseFloat(boxEl.style.left) || 0 : 0,
              y: boxEl ? parseFloat(boxEl.style.top) || 0 : 0,
            }];
          }));
          const state = useEditorStore.getState();
          state.boxes.forEach(box => {
            const pos = positions.get(box.id);
            if (pos) updateBox(box.id, pos);
          });
        } else {
          updateBox(el.id, {
            x: parseFloat(el.style.left) || 0,
            y: parseFloat(el.style.top) || 0,
          });
        }
      } else if (ir.mode === 'resizing' && ir.currentBoxElement) {
        const el = ir.currentBoxElement;
        updateBox(el.id, {
          w: parseFloat(el.style.width) || 0,
          h: parseFloat(el.style.height) || 0,
        });
      }

      ir.mode = 'idle';
      setInteractionMode('idle');
      ir.currentBoxElement = null;
      ir.clickTargetId = null;
      ir.dragBoxIds = [];
      ir.initialDragBoxes = [];
      setDragPreviewOffset(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [screenToCanvas, addBox, updateBox, setEditingBoxId, selectBox, selectBoxes, toggleBoxSelection, clearSelection, getRectFromPoints, boxesOverlap, marqueeGhost, updateMarquee]);

  // ─── 全局键盘快捷键 ──────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 不拦截输入框中的按键
      const target = e.target as HTMLElement;
      if (isTextEntryElement(target)) return;

      const store = useEditorStore.getState();
      const activeSelection = store.selectedBoxIds.length > 0
        ? store.selectedBoxIds
        : store.selectedBoxId ? [store.selectedBoxId] : [];
      const actionTarget = activeSelection.length === 1 ? activeSelection[0] : activeSelection;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'd':
            if (activeSelection.length > 0) {
              e.preventDefault();
              store.duplicateBox(actionTarget);
            }
            break;
          case 'x':
            if (activeSelection.length > 0) {
              e.preventDefault();
              store.cutBox(actionTarget);
            }
            break;
          case 'c':
            if (activeSelection.length > 0) {
              e.preventDefault();
              store.copyBox(actionTarget);
            }
            break;
          case 'v':
            // 内部剪贴板有内容 → 粘贴 box；无内容 → 让浏览器默认行为触发 paste 事件（处理外部图片）
            if (hasInternalClipboard()) {
              e.preventDefault();
              store.pasteBox();
            }
            break;
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (activeSelection.length > 0) {
          e.preventDefault();
          store.removeBox(actionTarget);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ─── Alt 修饰键状态跟踪（用于画布光标提示） ──────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltPressed(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltPressed(false);
    };
    // 窗口失焦时重置，防止 Alt+Tab 切换后状态卡住
    const onBlur = () => setAltPressed(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return {
    boxRefs,
    registerBoxRef,
    drawingGhost,
    marqueeGhost,
    dragPreviewOffset,
    interactionMode,
    altPressed,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
  };
}
