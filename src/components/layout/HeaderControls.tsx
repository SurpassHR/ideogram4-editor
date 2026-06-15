import { useState } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import GlowGrid from '../panels/GlowGrid';

export default function HeaderControls() {
  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const setCanvasDimensions = useEditorStore(s => s.setCanvasDimensions);
  const resetCanvas = useEditorStore(s => s.resetCanvas);
  const { lang, setLang, t } = useI18n();

  const [wDisplay, setWDisplay] = useState(String(canvasW).padStart(4, '0'));
  const [hDisplay, setHDisplay] = useState(String(canvasH).padStart(4, '0'));

  return (
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
    </GlowGrid>
  );
}