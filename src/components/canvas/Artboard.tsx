import { BottomCommandBar } from './BottomCommandBar';
import { useRef, useEffect, useLayoutEffect } from 'react';
import { useEditorStore } from '../../store';
import { useArtboardZoom } from '../../hooks/useArtboardZoom';
import { useI18n } from '../../i18n/context';
import { useCanvasChat } from '../../hooks/useCanvasChat';
import CanvasArea from './CanvasArea';
import LayerPanel from './LayerPanel';
import LayoutQualityDialog from './LayoutQualityDialog';
import ArtboardToolbar from './ArtboardToolbar';
import { IconRefresh, IconTrash } from '../ui/icons';

export default function Artboard() {
  const artboardRef = useRef<HTMLDivElement>(null);
  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const boxes = useEditorStore(s => s.boxes);
  const clearBoxes = useEditorStore(s => s.clearBoxes);
  const { t } = useI18n();
  const { handleRegenerate } = useCanvasChat();
  const pendingQualityReport = useEditorStore(s => s.pendingQualityReport);
  const setPendingQualityReport = useEditorStore(s => s.setPendingQualityReport);
  const isLayoutStreaming = useEditorStore(s => s.isLayoutStreaming);
  const streamingLayoutBoxCount = useEditorStore(s => s.streamingLayoutBoxCount);
  const layoutLocked = useEditorStore(s => s.isLayoutStreaming || s.layoutStreamRecovery !== null);

  const {
    zoom,
    panX,
    panY,
    handleMouseDown,
    fitToArtboard,
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

  // canvas 尺寸变化时自适应（useLayoutEffect 确保 zoom/pan 在 paint 前同步更新，消除错位帧）
  useLayoutEffect(() => {
    fitToArtboard();
  }, [canvasW, canvasH, fitToArtboard]);

  return (
    <div
      ref={artboardRef}
      className={`artboard${isPanning ? ' is-panning' : ''}`}
      onMouseDown={handleMouseDown}
    >
      <ArtboardToolbar />

      {isLayoutStreaming && (
        <div className="layout-streaming-status" role="status" aria-live="polite">
          <span className="layout-streaming-dot" />
          {t('chat.streamingLayout', { count: streamingLayoutBoxCount })}
        </div>
      )}

      <div className="artboard-controls">
        <span className="artboard-zoom-label">{Math.round(zoom * 100)}%</span>
        <button className="artboard-reset-btn" onClick={fitToArtboard} title={t('artboard.resetPosition')}>
          <IconRefresh size={14} />
        </button>
        <button
          className="artboard-clear-btn"
          onClick={clearBoxes}
          disabled={boxes.length === 0 || layoutLocked}
          title={t('contextMenu.clearAllBoxes')}
        >
          <IconTrash size={14} />
        </button>
      </div>

      <div
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: 'top left',
        }}
      >
        <CanvasArea zoom={zoom} panX={panX} panY={panY} screenToCanvas={screenToCanvas} onFitToArtboard={fitToArtboard} />
      </div>
      <LayerPanel />
      <BottomCommandBar />

      {/* 布局质量检测对话框 */}
      <LayoutQualityDialog
        report={pendingQualityReport}
        onAccept={() => setPendingQualityReport(null)}
        onRegenerate={handleRegenerate}
      />
    </div>
  );
}
