import { useRef, useState, useCallback, useEffect } from 'react';

interface ArtboardZoomState {
  zoom: number;
  panX: number;
  panY: number;
}

function clamp(val: number, min: number, max: number) {
  return Math.min(max, Math.max(min, val));
}

export function useArtboardZoom(
  artboardRef: React.RefObject<HTMLDivElement | null>,
  canvasW: number,
  canvasH: number,
) {
  const stateRef = useRef<ArtboardZoomState>({ zoom: 1, panX: 0, panY: 0 });
  const [, forceUpdate] = useState(0);
  const triggerUpdate = useCallback(() => forceUpdate((n) => n + 1), []);

  const isDragging = useRef(false);
  const dragStart = useRef({ panX: 0, panY: 0, mouseX: 0, mouseY: 0 });

  const fitToArtboard = useCallback(() => {
    const artboard = artboardRef.current;
    if (!artboard) return;
    const { width: aw, height: ah } = artboard.getBoundingClientRect();
    const z = clamp(Math.min(aw / canvasW, ah / canvasH, 1), 0.1, 5.0);
    const s = stateRef.current;
    s.zoom = z;
    s.panX = (aw - canvasW * z) / 2;
    s.panY = (ah - canvasH * z) / 2;
    triggerUpdate();
  }, [artboardRef, canvasW, canvasH, triggerUpdate]);

  const resetView = fitToArtboard;

  const screenToCanvas = useCallback(
    (sx: number, sy: number) => {
      const artboard = artboardRef.current;
      if (!artboard) return { x: 0, y: 0 };
      const rect = artboard.getBoundingClientRect();
      const s = stateRef.current;
      return {
        x: (sx - rect.left - s.panX) / s.zoom,
        y: (sy - rect.top - s.panY) / s.zoom,
      };
    },
    [artboardRef],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const artboard = artboardRef.current;
      if (!artboard) return;
      const rect = artboard.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const s = stateRef.current;
      const oldZoom = s.zoom;
      const newZoom = clamp(oldZoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.1, 5.0);
      s.zoom = newZoom;
      s.panX = mouseX - (mouseX - s.panX) * (newZoom / oldZoom);
      s.panY = mouseY - (mouseY - s.panY) * (newZoom / oldZoom);
      triggerUpdate();
    },
    [artboardRef, triggerUpdate],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    isDragging.current = true;
    const s = stateRef.current;
    dragStart.current = {
      panX: s.panX,
      panY: s.panY,
      mouseX: e.clientX,
      mouseY: e.clientY,
    };
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current) return;
      const d = dragStart.current;
      const s = stateRef.current;
      s.panX = d.panX + (e.clientX - d.mouseX);
      s.panY = d.panY + (e.clientY - d.mouseY);
      triggerUpdate();
    },
    [triggerUpdate],
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleMouseMove(e);
    const onMouseUp = () => handleMouseUp();
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const s = stateRef.current;
  return {
    zoom: s.zoom,
    panX: s.panX,
    panY: s.panY,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    fitToArtboard,
    resetView,
    screenToCanvas,
  };
}