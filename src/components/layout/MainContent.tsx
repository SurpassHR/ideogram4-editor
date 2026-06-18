import { useState, useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import Artboard from '../canvas/Artboard';
import JsonToolbar from '../json/JsonToolbar';
import ComfyUIControls from '../comfyui/ComfyUIControls';
import ImagePreview from '../comfyui/ImagePreview';
import RightPanelContainer from '../panels/RightPanelContainer';
import GlowGrid from '../panels/GlowGrid';
import SelectMenu from '../chat/SelectMenu';
import { useImageDrop } from '../../hooks/useImageDrop';
import { RATIO_KEYS, computeCanvasDims, type RatioKey } from '../../utils/canvas-dims';


export default function CanvasPage() {
  useImageDrop();
  const { t } = useI18n();

  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const canvasRatio = useEditorStore(s => s.canvasRatio);
  const setCanvasDimensions = useEditorStore(s => s.setCanvasDimensions);
  const setCanvasRatio = useEditorStore(s => s.setCanvasRatio);
  const resetCanvas = useEditorStore(s => s.resetCanvas);

  // ─── 比例 + 倍数 状态 ──────────────────────────────────────

  const [scale, setScale] = useState(4);
  const [customW, setCustomW] = useState(16);
  const [customH, setCustomH] = useState(9);

  const selectedRatio = canvasRatio as RatioKey;

  const applyDimensions = useCallback(
    (ratio: RatioKey, s: number, cw: number, ch: number) => {
      const { w, h } = computeCanvasDims(ratio, s, cw, ch);
      setCanvasDimensions(w, h);
    },
    [setCanvasDimensions],
  );

  // 首次挂载时同步初始尺寸（1:1, scale=4 → 1024×1024）
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      applyDimensions('1:1', 4, 16, 9);
    }
  }, [applyDimensions]);

  // ─── 事件处理 ──────────────────────────────────────────────

  const handleRatioChange = useCallback(
    (v: string) => {
      const ratio = v as RatioKey;
      setCanvasRatio(ratio);
      applyDimensions(ratio, scale, customW, customH);
    },
    [scale, customW, customH, applyDimensions, setCanvasRatio],
  );

  const handleScaleChange = useCallback(
    (s: number) => {
      setScale(s);
      applyDimensions(selectedRatio, s, customW, customH);
    },
    [selectedRatio, customW, customH, applyDimensions],
  );

  const handleCustomChange = useCallback(
    (cw: number, ch: number) => {
      setCustomW(cw);
      setCustomH(ch);
      applyDimensions('custom', scale, cw, ch);
    },
    [scale, applyDimensions],
  );

  // ─── Ratio 选项（从 i18n 获取标签） ────────────────────────

  const ratioOptions = RATIO_KEYS.map(k => ({
    value: k,
    label: t(`header.ratios.${k}` as Parameters<typeof t>[0]),
  }));

  return (
    <>
      {/* Canvas Controls: 比例 + 倍数 + 实时尺寸 */}
      <GlowGrid style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="canvas-controls-row">
          <span className="canvas-controls-label">{t('header.ratio')}</span>
          <SelectMenu
            options={ratioOptions}
            value={selectedRatio}
            onChange={handleRatioChange}
            className="canvas-ratio-select"
          />

          {selectedRatio === 'custom' && (
            <div className="canvas-custom-ratio">
              <input
                type="number"
                className="slider-number"
                style={{ width: 52 }}
                min={1}
                max={32}
                value={customW}
                onChange={e => {
                  const v = Math.max(1, Math.min(32, parseInt(e.target.value) || 1));
                  handleCustomChange(v, customH);
                }}
              />
              <span className="canvas-custom-ratio-sep">:</span>
              <input
                type="number"
                className="slider-number"
                style={{ width: 52 }}
                min={1}
                max={32}
                value={customH}
                onChange={e => {
                  const v = Math.max(1, Math.min(32, parseInt(e.target.value) || 1));
                  handleCustomChange(customW, v);
                }}
              />
            </div>
          )}

          <span className="canvas-controls-label">{t('header.scale')}</span>
          <div className="slider-row canvas-scale-slider">
            <input
              type="range"
              min={1}
              max={16}
              step={1}
              value={scale}
              onChange={e => {
                const v = parseInt(e.target.value);
                handleScaleChange(v);
              }}
            />
            <input
              type="number"
              className="slider-number"
              style={{ width: 52 }}
              min={1}
              max={16}
              value={scale}
              onChange={e => {
                const raw = parseInt(e.target.value);
                if (isNaN(raw)) return;
                const v = Math.max(1, Math.min(16, Math.round(raw)));
                handleScaleChange(v);
              }}
            />
          </div>

          <span className="canvas-dims-display">{canvasW} × {canvasH}</span>
        </div>

        <button className="btn" onClick={resetCanvas}>{t('header.resetCanvas')}</button>
      </GlowGrid>

      {/* Main Content: 画板 + 右侧面板 */}
      <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Artboard />
        </div>

        <div style={{ width: '320px', flexShrink: 0 }}>
          <RightPanelContainer />
        </div>
      </div>
    </>
  );
}

export function CanvasBottom() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
      <JsonToolbar />
      <ComfyUIControls />
      <ImagePreview />
    </div>
  );
}