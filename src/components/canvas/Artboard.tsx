import { useRef, useEffect } from 'react';
import { useEditorStore } from '../../store';
import { useArtboardZoom } from '../../hooks/useArtboardZoom';
import { useI18n } from '../../i18n/context';
import CanvasArea from './CanvasArea';

export default function Artboard() {
  const artboardRef = useRef<HTMLDivElement>(null);
  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const { t } = useI18n();

  const {
    zoom,
    panX,
    panY,
    handleWheel,
    handleMouseDown,
    fitToArtboard,
    resetView,
    screenToCanvas,
    isPanning,
  } = useArtboardZoom(artboardRef, canvasW, canvasH);

  // ResizeObserver: 容器尺寸变化时自适应
  useEffect(() => {
    const artboard = artboardRef.current;
    if (!artboard) return;
    const ro = new ResizeObserver(() => fitToArtboard());
    ro.observe(artboard);
    return () => ro.disconnect();
  }, [fitToArtboard]);

  // canvas 尺寸变化时自适应
  useEffect(() => {
    fitToArtboard();
  }, [canvasW, canvasH, fitToArtboard]);

  return (
    <div
      ref={artboardRef}
      className={`artboard${isPanning ? ' is-panning' : ''}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
    >
      <div className="artboard-controls">
        <button className="artboard-btn" onClick={fitToArtboard} title={t('artboard.fitToArtboard')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        </button>
        <span className="artboard-zoom-label">{Math.round(zoom * 100)}%</span>
        <button className="artboard-btn" onClick={resetView} title={t('artboard.resetView')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      </div>

      <div
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: 'top left',
        }}
      >
        <CanvasArea zoom={zoom} panX={panX} panY={panY} screenToCanvas={screenToCanvas} />
      </div>
    </div>
  );
}