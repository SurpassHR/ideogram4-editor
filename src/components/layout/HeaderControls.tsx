import { useCallback, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/context';
import { useEditorStore } from '../../store';
import SelectMenu from '../chat/SelectMenu';
import { RATIO_KEYS, type RatioKey } from '../../utils/canvas-dims';
import { IconPalette, IconStar, IconKeyboard } from '../ui/icons';

interface Props {
  currentHash: string;
  onNavigate: (path: string) => void;
}

export default function Header({ currentHash, onNavigate }: Props) {
  const { lang, setLang, t } = useI18n();
  const setShortcutsModalOpen = useEditorStore(s => s.setShortcutsModalOpen);

  // Toolbar state
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

  const isCanvas = currentHash !== '#/settings';

  const selectedRatio = canvasRatio as RatioKey;

  const ratioOptions = useMemo(() =>
    RATIO_KEYS.map(k => ({
      value: k,
      label: t(`header.ratios.${k}` as Parameters<typeof t>[0]),
    })),
    [t],
  );

  const handleRatioChange = useCallback(
    (v: string) => setCanvasRatio(v as RatioKey),
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
  }, [favoriteCurrentCanvas]);

  const [toast, setToast] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 1800);
  }, []);

  const wrappedFavorite = useCallback(() => {
    favoriteCurrentCanvas();
    showToast(t('header.favoriteSaved'));
  }, [favoriteCurrentCanvas, showToast, t]);

  return (
    <header className="app-header">
      <div className="app-header-logo" onClick={() => onNavigate('#/')} role="button" tabIndex={0}>
        <IconPalette size={18} /> Ideogram Editor
      </div>

      <nav className="app-header-nav">
        <button
          className={`app-header-nav-btn ${isCanvas ? 'active' : ''}`}
          onClick={() => onNavigate('#/')}
        >
          {t('nav.canvas')}
        </button>
        <button
          className={`app-header-nav-btn ${!isCanvas ? 'active' : ''}`}
          onClick={() => onNavigate('#/settings')}
        >
          {t('nav.settings')}
        </button>
      </nav>

      {/* ─── 工具栏（画布页显示） ─── */}
      {isCanvas && (
        <div className="header-toolbar">
          <div className="toolbar-group">
            <span className="toolbar-label">{t('header.ratio')}</span>
            <SelectMenu
              options={ratioOptions}
              value={selectedRatio}
              onChange={handleRatioChange}
              className="canvas-ratio-select"
            />
          </div>

          {selectedRatio === 'custom' && (
            <div className="canvas-custom-ratio">
              <input
                type="number"
                className="slider-number"
                style={{ width: 40 }}
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
                style={{ width: 40 }}
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

          <div className="toolbar-group">
            <span className="toolbar-label">{t('header.scale')}</span>
            <div className="slider-row header-scale-slider">
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
                style={{ width: 40 }}
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
          </div>

          <span className="header-dims">{canvasW} × {canvasH}</span>

          <button
            type="button"
            className="header-fav-btn"
            onClick={wrappedFavorite}
            aria-label={t('header.favoriteCanvas')}
            title={t('header.favoriteCanvas')}
          >
            <IconStar size={14} />
          </button>

          {toast && <span className="header-toast" role="status">{toast}</span>}
        </div>
      )}

      <button
        className="shortcuts-trigger-btn"
        onClick={() => setShortcutsModalOpen(true)}
        title={t('shortcuts.button')}
        aria-label={t('shortcuts.button')}
      >
        <IconKeyboard size={14} />
      </button>

      <div className="lang-switcher">
        <button
          className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
          onClick={() => setLang('en')}
        >
          EN
        </button>
        <button
          className={`lang-btn ${lang === 'zh' ? 'active' : ''}`}
          onClick={() => setLang('zh')}
        >
          中文
        </button>
      </div>
    </header>
  );
}