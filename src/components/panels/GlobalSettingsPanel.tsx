import { useEditorStore } from '../../store';
import { MODE_PHOTO, MODE_ARTSTYLE } from '../../types';
import ColorPalette from './ColorPalette';

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

  const isPhoto = photoArtStyleMode === MODE_PHOTO;
  const artStyleLabel = isPhoto ? 'Photo' : 'Art Style';

  return (
    <div className="panel">
      <h3>Global Settings</h3>

      <div className="pill-group" style={{ marginBottom: 16 }}>
        <label>
          <input
            type="radio"
            name="art_mode"
            checked={isPhoto}
            onChange={() => setPhotoArtStyleMode(MODE_PHOTO)}
          />
          <span className="pill-label">Photo</span>
        </label>
        <label>
          <input
            type="radio"
            name="art_mode"
            checked={!isPhoto}
            onChange={() => setPhotoArtStyleMode(MODE_ARTSTYLE)}
          />
          <span className="pill-label">Art Style</span>
        </label>
      </div>

      <div className="input-group">
        <label>High Level Description</label>
        <input
          type="text"
          value={highLevelDescription}
          onChange={e => setGlobalSetting('highLevelDescription', e.target.value)}
        />
      </div>

      <div className="input-group">
        <label>Aesthetics</label>
        <input
          type="text"
          value={aesthetics}
          onChange={e => setGlobalSetting('aesthetics', e.target.value)}
        />
      </div>

      <div className="input-group">
        <label>Lighting</label>
        <input
          type="text"
          value={lighting}
          onChange={e => setGlobalSetting('lighting', e.target.value)}
        />
      </div>

      <div className="input-group">
        <label>Medium</label>
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
        <label>Background</label>
        <textarea
          value={background}
          onChange={e => setGlobalSetting('background', e.target.value)}
        />
      </div>

      <ColorPalette
        label="Global Color Palette"
        colors={globalPalette}
        maxColors={16}
        onAdd={addGlobalColor}
        onRemove={removeGlobalColor}
      />
    </div>
  );
}