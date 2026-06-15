import { useState } from 'react';
import { useEditorStore } from '../../store';
import { useComfyUIGeneration } from '../../hooks/useComfyUIGeneration';
import { useI18n } from '../../i18n/context';
import GlowGrid from '../panels/GlowGrid';

export default function ComfyUIControls() {
  const apiUrl = useEditorStore(s => s.apiUrl);
  const seed = useEditorStore(s => s.seed);
  const setApiUrl = useEditorStore(s => s.setApiUrl);
  const setSeed = useEditorStore(s => s.setSeed);
  const generationStatus = useEditorStore(s => s.generationStatus);
  const { t } = useI18n();

  const { generate } = useComfyUIGeneration();

  const [seedDisplay, setSeedDisplay] = useState(String(seed).padStart(5, '0'));

  const isLoading = generationStatus === 'generating' || generationStatus === 'polling';

  return (
    <GlowGrid>
      <h3>{t('comfyui.generation')}</h3>

      <div className="input-group">
        <label>{t('comfyui.seed')} <span>{seedDisplay}</span></label>
        <input
          type="range"
          min={1}
          max={99999}
          value={seed}
          onChange={e => {
            setSeedDisplay(e.target.value.padStart(5, '0'));
          }}
          onMouseUp={e => {
            setSeed(parseInt((e.target as HTMLInputElement).value));
          }}
        />
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
    </GlowGrid>
  );
}