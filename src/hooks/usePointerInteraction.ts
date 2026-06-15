import { useCallback, useRef, useEffect, useState } from 'react';
import type { InteractionState, InteractionMode } from '../types';
import { useEditorStore } from '../store';

interface UsePointerInteractionOptions {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  scale: number;
}

export function usePointerInteraction({ canvasRef, scale }: UsePointerInteractionOptions) {
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
  });

  const boxRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [drawingGhost, setDrawingGhost] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const addBox = useEditorStore(s => s.addBox);
  const selectBox = useEditorStore(s => s.selectBox);
  const updateBox = useEditorStore(s => s.updateBox);

  const getPointerPos = useCallback((e: PointerEvent | React.PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  }, [canvasRef, scale]);

  const registerBoxRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) {
      boxRefs.current.set(id, el);
    } else {
      boxRefs.current.delete(id);
    }
  }, []);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;

    if (target.closest('.resize-handle')) {
      const boxEl = target.closest('.bounding-box') as HTMLDivElement;
      if (!boxEl) return;
      e.preventDefault();
      e.stopPropagation();

      const pos = getPointerPos(e);
      const ir = interactionRef.current;
      ir.mode = 'resizing';
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
      ir.dragStartX = pos.x;
      ir.dragStartY = pos.y;
      ir.initialBoxX = parseFloat(boxEl.style.left) || 0;
      ir.initialBoxY = parseFloat(boxEl.style.top) || 0;
      ir.currentBoxElement = boxEl;

      selectBox(boxEl.id);
      return;
    }

    if (target === canvasRef.current || (target as HTMLElement).id === 'canvas-inner') {
      const pos = getPointerPos(e);
      const ir = interactionRef.current;
      ir.mode = 'drawing';
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
    }
  }, [canvasRef, getPointerPos, selectBox]);

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

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;

      if (ir.mode === 'dragging') {
        ir.currentBoxElement.style.left = `${ir.initialBoxX + (x - ir.dragStartX)}px`;
        ir.currentBoxElement.style.top = `${ir.initialBoxY + (y - ir.dragStartY)}px`;
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
          addBox({ x, y, w, h, mode: 'obj', text: '', desc: '', colors: [] });
        }
        setDrawingGhost(null);
      } else if (ir.mode === 'dragging' && ir.currentBoxElement) {
        const el = ir.currentBoxElement;
        updateBox(el.id, {
          x: parseFloat(el.style.left) || 0,
          y: parseFloat(el.style.top) || 0,
        });
      } else if (ir.mode === 'resizing' && ir.currentBoxElement) {
        const el = ir.currentBoxElement;
        updateBox(el.id, {
          w: parseFloat(el.style.width) || 0,
          h: parseFloat(el.style.height) || 0,
        });
      }

      ir.mode = 'idle';
      ir.currentBoxElement = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [scale, addBox, updateBox, canvasRef]);

  return {
    boxRefs,
    registerBoxRef,
    drawingGhost,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
  };
}