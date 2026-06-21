import { useCallback, useMemo, useState } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import SelectMenu from '../chat/SelectMenu';
import { IconStar } from '../ui/icons';
import { RATIO_KEYS, type RatioKey } from '../../utils/canvas-dims';

export default function ArtboardToolbar() {
  const { t } = useI18n();

  const canvasRatio = useEditorStore(s => s.canvasRatio);
  const canvasScale = useEditorStore(s => s.canvasScale);
  const canvasCustomW = useEditorStore(s => s.canvasCustomW);
  const canvasCustomH = useEditorStore(s => s.canvasCustomH);
  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const setCanvasRatio = useEditorStore(s => s.setCanvasRatio);
  const setCanvasScale = useEditorStore(s => s.setCanvasScale);
  const setCanvasCustom = useEditorStore(s => s.setCanvasCustom);
  const favoriteCurrentCanvas = useEditorStore(s => s.favoriteCurrentCanvas);
  const [toast, setToast] = useState('');

  const selectedRatio = canvasRatio as RatioKey;

  const ratioOptions = useMemo(() =>
    RATIO_KEYS.map(k => ({
      value: k,
      label: t(`header.ratios.${k}` as Parameters<typeof t>[0]),
    })),
    [t],
  );

  const handleRatioChange = useCallback(
    (v: string) => setCanvasRatio(v),
    [setCanvasRatio],
  );

  const handleScaleChange = useCallback(
    (s: number) => setCanvasScale(s),
    [setCanvasScale],
  );

  const handleCustomChange = useCallback(
    (cw: number, ch: number) => setCanvasCustom(cw, ch),
    [setCanvasCustom],
  );

  const handleFavorite = useCallback(() => {
    favoriteCurrentCanvas();
    setToast(t('header.favoriteSaved'));
    window.setTimeout(() => setToast(''), 1800);
  }, [favoriteCurrentCanvas, t]);

  return (
    <div className="artboard-toolbar">
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
              style={{ width: 48 }}
              min={1}
              max={32}
              value={canvasCustomW}
              onChange={e => {
                const v = Math.max(1, Math.min(32, parseInt(e.target.value) || 1));
                handleCustomChange(v, canvasCustomH);
              }}
            />
            <span className="canvas-custom-ratio-sep">:</span>
            <input
              type="number"
              className="slider-number"
              style={{ width: 48 }}
              min={1}
              max={32}
              value={canvasCustomH}
              onChange={e => {
                const v = Math.max(1, Math.min(32, parseInt(e.target.value) || 1));
                handleCustomChange(canvasCustomW, v);
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
            value={canvasScale}
            onChange={e => {
              const v = parseInt(e.target.value);
              handleScaleChange(v);
            }}
          />
          <input
            type="number"
            className="slider-number"
            style={{ width: 48 }}
            min={1}
            max={16}
            value={canvasScale}
            onChange={e => {
              const raw = parseInt(e.target.value);
              if (isNaN(raw)) return;
              const v = Math.max(1, Math.min(16, Math.round(raw)));
              handleScaleChange(v);
            }}
          />
        </div>

        <span className="canvas-dims-display">{canvasW} × {canvasH}</span>

        <button
          type="button"
          className="artboard-favorite-btn"
          onClick={handleFavorite}
          aria-label={t('header.favoriteCanvas')}
          title={t('header.favoriteCanvas')}
        >
          <IconStar size={14} />
        </button>

        {toast && <span className="artboard-toolbar-toast" role="status">{toast}</span>}

    </div>
  );
}
