import { useEditorStore } from '../../store';
import { MODE_PHOTO, MODE_ARTSTYLE } from '../../types';
import { useI18n } from '../../i18n/context';
import ColorPalette from './ColorPalette';
import GlowGrid from './GlowGrid';

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

  const isPhoto = photoArtStyleMode === MODE_PHOTO;
  const artStyleLabel = isPhoto ? t('panels.globalSettings.photo') : t('panels.globalSettings.artStyle');

  return (
    <GlowGrid className="panel">
      <h3>{t('panels.globalSettings.title')}</h3>

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

      <div className="input-group">
        <label>{t('panels.globalSettings.highLevelDescription')}</label>
        <input
          type="text"
          value={highLevelDescription}
          onChange={e => setGlobalSetting('highLevelDescription', e.target.value)}
        />
      </div>

      <div className="input-group">
        <label>{t('panels.globalSettings.aesthetics')}</label>
        <input
          type="text"
          value={aesthetics}
          onChange={e => setGlobalSetting('aesthetics', e.target.value)}
        />
      </div>

      <div className="input-group">
        <label>{t('panels.globalSettings.lighting')}</label>
        <input
          type="text"
          value={lighting}
          onChange={e => setGlobalSetting('lighting', e.target.value)}
        />
      </div>

      <div className="input-group">
        <label>{t('panels.globalSettings.medium')}</label>
        <input
          type="text"
          value={medium}
          disabled={isPhoto}
          onChange={e => setGlobalSetting('medium', e.target.value)}
        />
      </div>

      <div className="input-group">
        <label>{artStyleLabel}</label>
        <input
          type="text"
          value={artStyle}
          onChange={e => setGlobalSetting('artStyle', e.target.value)}
        />
      </div>

      <div className="input-group">
        <label>{t('panels.globalSettings.background')}</label>
        <textarea
          value={background}
          onChange={e => setGlobalSetting('background', e.target.value)}
        />
      </div>

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