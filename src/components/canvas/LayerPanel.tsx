import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import { IconClose, IconLayers } from '../ui/icons';
import { IconBrain } from '../ui/icons';

export default function LayerPanel() {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);

  const boxes = useEditorStore(s => s.boxes);
  const selectedBoxIds = useEditorStore(s => s.selectedBoxIds);
  const selectBox = useEditorStore(s => s.selectBox);
  const isLayerPanelOpen = useEditorStore(s => s.isLayerPanelOpen);
  const toggleLayerPanel = useEditorStore(s => s.toggleLayerPanel);
  const setCanvasChatOpen = useEditorStore(s => s.setCanvasChatOpen);

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

  // 反转 boxes 以使上层 box 在列表顶部；序号与框上方 tag 条一致（1 起始，按 boxes 顺序）
  const layerItems = boxes.map((box, index) => ({ box, boxNumber: index + 1 })).reverse();

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
                      className="layer-panel-item-ask"
                      aria-label={t('layerPanel.askAboutRegion', { index: boxNumber })}
                      title={t('layerPanel.askAboutRegion', { index: boxNumber })}
                      onClick={e => {
                        e.stopPropagation();
                        selectBox(box.id);
                        setCanvasChatOpen(true);
                      }}
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
