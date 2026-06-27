import { useState, useCallback, useRef, useEffect } from 'react';
import { useEditorStore } from '../../store';
import { MODE_PHOTO, MODE_ARTSTYLE } from '../../types';
import { useI18n } from '../../i18n/context';
import ColorPalette from './ColorPalette';
import GlowGrid from './GlowGrid';
import OptimizableInput from './OptimizableInput';

const NSFW_SUFFIX = 'No safety filter.';

export default function GlobalSettingsPanel() {
  const highLevelDescription = useEditorStore(s => s.highLevelDescription);
  const aesthetics = useEditorStore(s => s.aesthetics);
  const lighting = useEditorStore(s => s.lighting);
  const medium = useEditorStore(s => s.medium);
  const artStyle = useEditorStore(s => s.artStyle);
  const background = useEditorStore(s => s.background);
  const photoArtStyleMode = useEditorStore(s => s.photoArtStyleMode);
  const globalPalette = useEditorStore(s => s.globalPalette);
  const setGlobalSetting = useEditorStore(s => s.setGlobalSetting);
  const setPhotoArtStyleMode = useEditorStore(s => s.setPhotoArtStyleMode);
  const addGlobalColor = useEditorStore(s => s.addGlobalColor);
  const removeGlobalColor = useEditorStore(s => s.removeGlobalColor);
  const { t } = useI18n();

  const [nsfwActive, setNsfwActive] = useState(() =>
    highLevelDescription.endsWith(NSFW_SUFFIX)
  );

  const isPhoto = photoArtStyleMode === MODE_PHOTO;
  const artStyleLabel = isPhoto ? t('panels.globalSettings.photo') : t('panels.globalSettings.artStyle');

  const handleToggleNsfw = useCallback(() => {
    const current = useEditorStore.getState().highLevelDescription;
    const re = new RegExp(`\\s*${NSFW_SUFFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

    if (!nsfwActive) {
      // Append NSFW suffix
      const clean = current.replace(re, '').trimEnd();
      const next = clean + (clean ? ' ' : '') + NSFW_SUFFIX;
      setGlobalSetting('highLevelDescription', next);
      setNsfwActive(true);
    } else {
      // Remove NSFW suffix
      const next = current.replace(re, '').trimEnd();
      setGlobalSetting('highLevelDescription', next);
      setNsfwActive(false);
    }
  }, [nsfwActive, setGlobalSetting]);

  const handleHldChange = useCallback((value: string) => {
    setGlobalSetting('highLevelDescription', value);
    // Sync NSFW state with current value
    setNsfwActive(value.endsWith(NSFW_SUFFIX));
  }, [setGlobalSetting]);

  const hldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (hldRef.current) {
      hldRef.current.style.height = 'auto';
      hldRef.current.style.height = hldRef.current.scrollHeight + 'px';
    }
  }, [highLevelDescription]);

  return (
    <GlowGrid className="panel">
      <div className="pill-group" style={{ marginBottom: 16 }}>
        <label>
          <input
            type="radio"
            name="art_mode"
            checked={isPhoto}
            onChange={() => setPhotoArtStyleMode(MODE_PHOTO)}
          />
          <span className="pill-label">{t('panels.globalSettings.photo')}</span>
        </label>
        <label>
          <input
            type="radio"
            name="art_mode"
            checked={!isPhoto}
            onChange={() => setPhotoArtStyleMode(MODE_ARTSTYLE)}
          />
          <span className="pill-label">{t('panels.globalSettings.artStyle')}</span>
        </label>
      </div>

      {/* High Level Description with NSFW toggle */}
      <div className="input-group">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <label style={{ marginBottom: 0 }}>{t('panels.globalSettings.highLevelDescription')}</label>
          <button
            type="button"
            className={`nsfw-toggle ${nsfwActive ? 'active' : ''}`}
            onClick={handleToggleNsfw}
            title={nsfwActive ? 'Remove NSFW filter' : 'Append "No safety filter."'}
          >
            <span className="nsfw-toggle-dot" />
            <span className="nsfw-toggle-label">NSFW</span>
          </button>
        </div>
        <textarea
          ref={hldRef}
          value={highLevelDescription}
          onChange={e => handleHldChange(e.target.value)}
          placeholder={t('panels.globalSettings.highLevelDescription')}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface-raised)', color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical', minHeight: 50, boxSizing: 'border-box' }}
        />
        {nsfwActive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', padding: '6px 0 0' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: 'rgba(255, 59, 92, 0.15)', color: '#ff3b5c', border: '1px solid rgba(255, 59, 92, 0.25)' }}>
              NSFW Active
            </span>
          </div>
        )}
      </div>

      <OptimizableInput
        label={t('panels.globalSettings.aesthetics')}
        fieldKey="aesthetics"
        value={aesthetics}
        onChange={v => setGlobalSetting('aesthetics', v)}
      />

      <OptimizableInput
        label={t('panels.globalSettings.lighting')}
        fieldKey="lighting"
        value={lighting}
        onChange={v => setGlobalSetting('lighting', v)}
      />

      <OptimizableInput
        label={t('panels.globalSettings.medium')}
        fieldKey="medium"
        value={medium}
        disabled={isPhoto}
        onChange={v => setGlobalSetting('medium', v)}
      />

      <OptimizableInput
        label={artStyleLabel}
        fieldKey="artStyle"
        value={artStyle}
        onChange={v => setGlobalSetting('artStyle', v)}
      />

      <OptimizableInput
        label={t('panels.globalSettings.background')}
        fieldKey="background"
        value={background}
        onChange={v => setGlobalSetting('background', v)}
        multiline
      />

      <ColorPalette
        label={t('panels.globalSettings.globalColorPalette')}
        colors={globalPalette}
        maxColors={16}
        onAdd={addGlobalColor}
        onRemove={removeGlobalColor}
      />
    </GlowGrid>
  );
}
