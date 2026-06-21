import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import ColorPalette from './ColorPalette';
import GlowGrid from './GlowGrid';

export default function BoxPropertiesPanel() {
  const selectedBoxId = useEditorStore(s => s.selectedBoxId);
  const selectedBoxIds = useEditorStore(s => s.selectedBoxIds);
  const boxes = useEditorStore(s => s.boxes);
  const updateBox = useEditorStore(s => s.updateBox);
  const removeBox = useEditorStore(s => s.removeBox);
  const addBoxColor = useEditorStore(s => s.addBoxColor);
  const removeBoxColor = useEditorStore(s => s.removeBoxColor);
  const { t } = useI18n();

  const box = boxes.find(b => b.id === selectedBoxId);

  if (selectedBoxIds.length > 1) {
    return (
      <GlowGrid id="box-panel">
        <div className="multi-select-summary">
          {t('panels.boxProperties.multiSelected', { count: selectedBoxIds.length })}
        </div>
        <button
          className="btn btn-danger"
          style={{ marginTop: 12 }}
          onClick={() => removeBox(selectedBoxIds)}
        >
          {t('panels.boxProperties.deleteSelected')}
        </button>
      </GlowGrid>
    );
  }

  if (!selectedBoxId || !box) {
    return (
      <GlowGrid id="box-panel" style={{ display: 'none' }}>
        {null}
      </GlowGrid>
    );
  }

  return (
    <GlowGrid id="box-panel">
      <div className="input-group">
        <label>{t('panels.boxProperties.mode')}</label>
        <select
          value={box.mode}
          onChange={e => updateBox(box.id, { mode: e.target.value as 'obj' | 'text' })}
        >
          <option value="obj">{t('panels.boxProperties.objectLabel')}</option>
          <option value="text">{t('panels.boxProperties.textLabel')}</option>
        </select>
      </div>

      {box.mode === 'text' && (
        <div className="input-group">
          <label>{t('panels.boxProperties.textContent')}</label>
          <input
            type="text"
            value={box.text}
            onChange={e => updateBox(box.id, { text: e.target.value })}
          />
        </div>
      )}

      <div className="input-group">
        <label>{t('panels.boxProperties.description')}</label>
        <textarea
          value={box.desc}
          onChange={e => updateBox(box.id, { desc: e.target.value })}
        />
      </div>

      <ColorPalette
        label={t('panels.boxProperties.boxColorPalette')}
        colors={box.colors}
        maxColors={5}
        onAdd={addBoxColor}
        onRemove={removeBoxColor}
      />

      <button
        className="btn btn-danger"
        style={{ marginTop: 12 }}
        onClick={() => removeBox(box.id)}
      >
        {t('panels.boxProperties.deleteBox')}
      </button>
    </GlowGrid>
  );
}
