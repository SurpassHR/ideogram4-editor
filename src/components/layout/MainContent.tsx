import { useState } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import Artboard from '../canvas/Artboard';
import JsonToolbar from '../json/JsonToolbar';
import ComfyUIControls from '../comfyui/ComfyUIControls';
import ImagePreview from '../comfyui/ImagePreview';
import RightPanelContainer from '../panels/RightPanelContainer';
import GlowGrid from '../panels/GlowGrid';
import { useImageDrop } from '../../hooks/useImageDrop';

export default function CanvasPage() {
  useImageDrop();
  const { t } = useI18n();

  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const setCanvasDimensions = useEditorStore(s => s.setCanvasDimensions);
  const resetCanvas = useEditorStore(s => s.resetCanvas);

  const [wDisplay, setWDisplay] = useState(String(canvasW).padStart(4, '0'));
  const [hDisplay, setHDisplay] = useState(String(canvasH).padStart(4, '0'));

  return (
    <>
      {/* Canvas Controls: 宽高滑块 + 重置按钮 */}
      <GlowGrid style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="input-group" style={{ margin: 0, flex: 1, minWidth: 200 }}>
          <label>{t('header.width')} <span>{wDisplay}</span></label>
          <div className="slider-row">
            <input
              type="range"
              min={256}
              max={4096}
              step={16}
              value={canvasW}
              onChange={e => {
                const w = parseInt(e.target.value);
                setWDisplay(e.target.value.padStart(4, '0'));
                setCanvasDimensions(w, canvasH);
              }}
            />
            <input
              type="number"
              className="slider-number"
              min={256}
              max={4096}
              step={16}
              value={canvasW}
              onChange={e => {
                const raw = parseInt(e.target.value);
                if (isNaN(raw)) return;
                const w = Math.max(256, Math.min(4096, Math.round(raw / 16) * 16));
                setWDisplay(String(w).padStart(4, '0'));
                setCanvasDimensions(w, canvasH);
              }}
            />
          </div>
        </div>
        <div className="input-group" style={{ margin: 0, flex: 1, minWidth: 200 }}>
          <label>{t('header.height')} <span>{hDisplay}</span></label>
          <div className="slider-row">
            <input
              type="range"
              min={256}
              max={4096}
              step={16}
              value={canvasH}
              onChange={e => {
                const h = parseInt(e.target.value);
                setHDisplay(e.target.value.padStart(4, '0'));
                setCanvasDimensions(canvasW, h);
              }}
            />
            <input
              type="number"
              className="slider-number"
              min={256}
              max={4096}
              step={16}
              value={canvasH}
              onChange={e => {
                const raw = parseInt(e.target.value);
                if (isNaN(raw)) return;
                const h = Math.max(256, Math.min(4096, Math.round(raw / 16) * 16));
                setHDisplay(String(h).padStart(4, '0'));
                setCanvasDimensions(canvasW, h);
              }}
            />
          </div>
        </div>
        <button className="btn" onClick={resetCanvas}>{t('header.resetCanvas')}</button>
      </GlowGrid>

      {/* Main Content: 画板 + JSON + 生成 + 右侧面板 */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
          <Artboard />
          <JsonToolbar />
          <ComfyUIControls />
          <ImagePreview />
        </div>

        <div style={{ width: '320px', flexShrink: 0 }}>
          <RightPanelContainer />
        </div>
      </div>
    </>
  );
}