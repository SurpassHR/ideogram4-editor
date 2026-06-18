import { useCallback, useRef, useEffect, useState } from 'react';
import type { InteractionMode } from '../types';
import type { InteractionState } from '../types';
import { useEditorStore } from '../store';

interface UsePointerInteractionOptions {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panX: number;
  panY: number;
  screenToCanvas: (sx: number, sy: number) => { x: number; y: number };
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
  });

  const boxRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [drawingGhost, setDrawingGhost] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('idle');
  const [altPressed, setAltPressed] = useState(false);

  const addBox = useEditorStore(s => s.addBox);
  const selectBox = useEditorStore(s => s.selectBox);
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

  // 进入 drawing 模式：在按下位置创建 ghost div，由 pointermove 更新尺寸、pointerup 落盘
  const startDrawing = useCallback((e: React.PointerEvent) => {
    const pos = getPointerPos(e);
    const ir = interactionRef.current;
    ir.mode = 'drawing';
    setInteractionMode('drawing');
    ir.startX = pos.x;
    ir.startY = pos.y;

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

    // Alt 修饰键：忽略命中检测（resize-handle / bounding-box），直接进入 drawing 模式，
    // 允许在已有 box 重叠区域绘制创建新 box（addBox 追加到 boxes 末尾即最上层）
    if (e.altKey) {
      startDrawing(e);
      return;
    }

    if (target.closest('.resize-handle')) {
      const boxEl = target.closest('.bounding-box') as HTMLDivElement;
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

    if (target.closest('.bounding-box')) {
      const boxEl = target.closest('.bounding-box') as HTMLDivElement;
      if (!boxEl) return;
      e.preventDefault();
      e.stopPropagation();

      const pos = getPointerPos(e);
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

      selectBox(boxEl.id);
      return;
    }

    if (target === canvasRef.current || (target as HTMLElement).id === 'canvas-inner') {
      startDrawing(e);
    }
  }, [canvasRef, getPointerPos, selectBox, startDrawing]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    const ir = interactionRef.current;
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
  }, [getPointerPos]);

  // Window-level listeners for drag/resize (pointer-escape support) and pointerup
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const ir = interactionRef.current;
      if (ir.mode !== 'dragging' && ir.mode !== 'resizing') return;
      if (!ir.currentBoxElement) return;

      const { x, y } = screenToCanvas(e.clientX, e.clientY);

      if (ir.mode === 'dragging') {
        const dx = x - ir.dragStartX;
        const dy = y - ir.dragStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          ir.pointerMoved = true;
        }
        ir.currentBoxElement.style.left = `${ir.initialBoxX + dx}px`;
        ir.currentBoxElement.style.top = `${ir.initialBoxY + dy}px`;
      } else if (ir.mode === 'resizing') {
        ir.currentBoxElement.style.width = `${Math.max(10, ir.initialBoxW + (x - ir.dragStartX))}px`;
        ir.currentBoxElement.style.height = `${Math.max(10, ir.initialBoxH + (y - ir.dragStartY))}px`;
      }
    };

    const onPointerUp = () => {
      const ir = interactionRef.current;

      if (ir.mode === 'drawing' && ir.currentBoxElement) {
        const el = ir.currentBoxElement;
        const x = parseFloat(el.style.left) || 0;
        const y = parseFloat(el.style.top) || 0;
        const w = parseFloat(el.style.width) || 0;
        const h = parseFloat(el.style.height) || 0;
        el.remove();

        if (w >= 10 && h >= 10) {
          addBox({ x, y, w, h, mode: 'obj', text: '', desc: '', colors: [], imageDataUrl: null, imageRole: 'both' });
        }
        setDrawingGhost(null);
      } else if (ir.mode === 'dragging' && ir.currentBoxElement) {
        const el = ir.currentBoxElement;
        if (!ir.pointerMoved) {
          const now = Date.now();
          // 双击检测：同一 box 在 300ms 内被点击两次 → 进入文字编辑模式
          if (ir.lastClickBoxId === el.id && now - ir.lastClickTime < 300) {
            setEditingBoxId(el.id);
            ir.lastClickTime = 0;
            ir.lastClickBoxId = null;
          } else {
            // 单击：不打开 Chat，仅记录点击时间用于双击检测
            ir.lastClickTime = now;
            ir.lastClickBoxId = el.id;
          }
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
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [screenToCanvas, addBox, updateBox, setEditingBoxId]);

  // ─── 全局键盘快捷键 ──────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 不拦截输入框中的按键
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) return;

      const store = useEditorStore.getState();
      const { selectedBoxId } = store;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'd':
            if (selectedBoxId) {
              e.preventDefault();
              store.duplicateBox(selectedBoxId);
            }
            break;
          case 'x':
            if (selectedBoxId) {
              e.preventDefault();
              store.cutBox(selectedBoxId);
            }
            break;
          case 'c':
            if (selectedBoxId) {
              e.preventDefault();
              store.copyBox(selectedBoxId);
            }
            break;
          case 'v':
            e.preventDefault();
            store.pasteBox();
            break;
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedBoxId) {
          e.preventDefault();
          store.removeBox(selectedBoxId);
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
    interactionMode,
    altPressed,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
  };
}