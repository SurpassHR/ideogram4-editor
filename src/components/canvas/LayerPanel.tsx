import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import { IconClose, IconLayers } from '../ui/icons';
import { IconBrain } from '../ui/icons';

export default function LayerPanel() {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    moved: boolean;
    parentRect: DOMRect;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const boxes = useEditorStore(s => s.boxes);
  const selectedBoxIds = useEditorStore(s => s.selectedBoxIds);
  const selectBox = useEditorStore(s => s.selectBox);
  const isLayerPanelOpen = useEditorStore(s => s.isLayerPanelOpen);
  const toggleLayerPanel = useEditorStore(s => s.toggleLayerPanel);
  const setCanvasChatOpen = useEditorStore(s => s.setCanvasChatOpen);
  const layoutLocked = useEditorStore(s => s.isLayoutStreaming || s.layoutStreamRecovery !== null);

  // Escape 关闭
  useEffect(() => {
    if (!isLayerPanelOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleLayerPanel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isLayerPanelOpen, toggleLayerPanel]);

  // 反转 boxes 以使上层 box 在列表顶部；序号与框上方 tag 条一致（1 起始，按 boxes 顺序）
  const layerItems = boxes.map((box, index) => ({ box, boxNumber: index + 1 })).reverse();

  const handleDragPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const wrapper = panelRef.current;
    if (!wrapper) return;
    const parent = wrapper.offsetParent instanceof HTMLElement ? wrapper.offsetParent : document.body;
    const wrapperRect = wrapper.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: wrapperRect.left - parentRect.left,
      originTop: wrapperRect.top - parentRect.top,
      moved: false,
      parentRect,
    };
    suppressClickRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleDragPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return;
      drag.moved = true;
      suppressClickRef.current = true;
      setIsDragging(true);
    }
    const wrapper = panelRef.current;
    if (!wrapper) return;
    const maxLeft = Math.max(0, drag.parentRect.width - wrapper.offsetWidth);
    const maxTop = Math.max(0, drag.parentRect.height - wrapper.offsetHeight);
    setPanelPosition({
      left: Math.min(Math.max(0, drag.originLeft + dx), maxLeft),
      top: Math.min(Math.max(0, drag.originTop + dy), maxTop),
    });
  };

  const handleDragPointerEnd = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragStateRef.current = null;
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleToggleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    toggleLayerPanel();
  };

  return (
    <div
      className={`layer-panel-wrapper${isDragging ? ' is-dragging' : ''}`}
      ref={panelRef}
      style={panelPosition ? { left: panelPosition.left, top: panelPosition.top, right: 'auto' } : undefined}
    >
      {/* 展开按钮 */}
      <button
        className={`layer-panel-toggle${boxes.length === 0 ? ' disabled' : ''}`}
        onClick={handleToggleClick}
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerEnd}
        onPointerCancel={handleDragPointerEnd}
        title={t('layerPanel.toggle')}
        aria-label={t('layerPanel.toggle')}
        disabled={boxes.length === 0}
      >
        <IconLayers size={16} />
        <span className="layer-panel-toggle-label">{t('layerPanel.toggle')}</span>
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
              layerItems.map(({ box, boxNumber }) => {
                const isSelected = selectedBoxIds.includes(box.id);
                const color = box.colors?.[0] || '#666';
                const modeLabel = box.mode === 'text' ? t('boundingBox.textMode') : t('boundingBox.objectMode');
                const label = box.text || box.desc || modeLabel;
                return (
                  <div
                    key={box.id}
                    className={`layer-panel-item${isSelected ? ' selected' : ''}`}
                    onClick={() => selectBox(box.id)}
                    title={label}
                  >
                    <span className="layer-panel-item-index">{boxNumber}</span>
                    <span
                      className="layer-panel-item-dot"
                      style={{ backgroundColor: color }}
                    />
                    <span className="layer-panel-item-label">{label}</span>
                    {/* 针对该区域提问：选中该 box，Canvas Chat 自动跟随 */}
                    <button
                      type="button"
                      className={`layer-panel-item-ask${layoutLocked ? ' disabled' : ''}`}
                      aria-label={t('layerPanel.askAboutRegion', { index: boxNumber })}
                      title={t('layerPanel.askAboutRegion', { index: boxNumber })}
                      onClick={e => {
                        e.stopPropagation();
                        if (layoutLocked) return;
                        selectBox(box.id);
                        setCanvasChatOpen(true);
                      }}
                      disabled={layoutLocked}
                    >
                      <IconBrain size={12} />
                    </button>
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
