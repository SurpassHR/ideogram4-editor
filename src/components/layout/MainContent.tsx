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

// ─── 比例预设 ────────────────────────────────────────────────

const RATIO_KEYS = ['1:1', '16:9', '9:16', '4:3', '3:2', '2:1', 'custom'] as const;
type RatioKey = typeof RATIO_KEYS[number];

const RATIO_BASES: Record<RatioKey, { baseW: number; baseH: number }> = {
  '1:1': { baseW: 256, baseH: 256 },
  '16:9': { baseW: 256, baseH: 144 },
  '9:16': { baseW: 144, baseH: 256 },
  '4:3': { baseW: 256, baseH: 192 },
  '3:2': { baseW: 240, baseH: 160 },
  '2:1': { baseW: 256, baseH: 128 },
  custom: { baseW: 256, baseH: 256 },
};

const roundTo16 = (n: number) => Math.round(n / 16) * 16;
const clampDim = (n: number) => Math.max(256, Math.min(4096, roundTo16(n)));

/** 根据比例 + 倍数 + 自定义宽高比计算实际画布尺寸 */
function computeCanvasDims(ratio: RatioKey, scale: number, customW: number, customH: number) {
  let baseW: number;
  let baseH: number;
  if (ratio === 'custom') {
    const maxDim = Math.max(customW, customH, 1);
    baseW = (256 * customW) / maxDim;
    baseH = (256 * customH) / maxDim;
  } else {
    const bases = RATIO_BASES[ratio];
    baseW = bases.baseW;
    baseH = bases.baseH;
  }
  return {
    w: clampDim(baseW * scale),
    h: clampDim(baseH * scale),
  };
}

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

      {/* Main Content: 画板 + JSON + 生成 + 右侧面板 */}
      <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0, minHeight: 0 }}>
          <Artboard />
          <div style={{ overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <JsonToolbar />
            <ComfyUIControls />
            <ImagePreview />
          </div>
        </div>

        <div style={{ width: '320px', flexShrink: 0, overflowY: 'auto' }}>
          <RightPanelContainer />
        </div>
      </div>
    </>
  );
}