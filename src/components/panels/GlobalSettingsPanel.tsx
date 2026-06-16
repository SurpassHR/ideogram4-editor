import { useEditorStore } from '../../store';
import { MODE_PHOTO, MODE_ARTSTYLE } from '../../types';
import { useI18n } from '../../i18n/context';
import ColorPalette from './ColorPalette';
import GlowGrid from './GlowGrid';
import OptimizableInput from './OptimizableInput';

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

      <OptimizableInput
        label={t('panels.globalSettings.highLevelDescription')}
        fieldKey="highLevelDescription"
        value={highLevelDescription}
        onChange={v => setGlobalSetting('highLevelDescription', v)}
      />

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
