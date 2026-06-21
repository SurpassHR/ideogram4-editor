import { useEditorStore } from '../../store';
import { useComfyUIGeneration } from '../../hooks/useComfyUIGeneration';
import { useI18n } from '../../i18n/context';

export default function ComfyUIControls() {
  const apiUrl = useEditorStore(s => s.apiUrl);
  const seed = useEditorStore(s => s.seed);
  const setApiUrl = useEditorStore(s => s.setApiUrl);
  const setSeed = useEditorStore(s => s.setSeed);
  const generationStatus = useEditorStore(s => s.generationStatus);
  const { t } = useI18n();

  const { generate } = useComfyUIGeneration();

  const isLoading = generationStatus === 'generating' || generationStatus === 'polling';
  const seedDisplay = String(seed).padStart(5, '0');

  return (
    <div className="comfyui-controls">
      <div className="input-group">
        <label>
          {t('comfyui.seed')}
          <span>{seedDisplay}</span>
        </label>
        <div className="slider-row">
          <input
            type="range"
            min={1}
            max={99999}
            value={seed}
            onChange={e => {
              setSeed(parseInt(e.target.value));
            }}
          />
          <input
            type="number"
            className="slider-number"
            min={1}
            max={99999}
            value={seed}
            onChange={e => {
              const raw = parseInt(e.target.value);
              if (isNaN(raw)) return;
              const v = Math.max(1, Math.min(99999, Math.round(raw)));
              setSeed(v);
            }}
          />
        </div>
      </div>

      <div className="input-group">
        <label>{t('comfyui.apiUrl')}</label>
        <input
          type="text"
          value={apiUrl}
          onChange={e => setApiUrl(e.target.value)}
        />
      </div>

      <button
        className="btn"
        onClick={generate}
        disabled={isLoading}
        style={{ opacity: isLoading ? 0.6 : 1 }}
      >
        {isLoading ? t('comfyui.generating') : t('comfyui.generateImage')}
      </button>
    </div>
  );
}
