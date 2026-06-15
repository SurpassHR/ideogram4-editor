import { useEditorStore } from '../../store';
import ColorPalette from './ColorPalette';

export default function BoxPropertiesPanel() {
  const selectedBoxId = useEditorStore(s => s.selectedBoxId);
  const boxes = useEditorStore(s => s.boxes);
  const updateBox = useEditorStore(s => s.updateBox);
  const removeBox = useEditorStore(s => s.removeBox);
  const selectBox = useEditorStore(s => s.selectBox);
  const addBoxColor = useEditorStore(s => s.addBoxColor);
  const removeBoxColor = useEditorStore(s => s.removeBoxColor);

  const box = boxes.find(b => b.id === selectedBoxId);

  if (!selectedBoxId || !box) {
    return (
      <div className="panel" id="box-panel" style={{ display: 'none' }}>
        <h3>Selected Box Properties</h3>
      </div>
    );
  }

  return (
    <div className="panel" id="box-panel">
      <h3>Selected Box Properties</h3>

      <div className="input-group">
        <label>Mode</label>
        <select
          value={box.mode}
          onChange={e => updateBox(box.id, { mode: e.target.value as 'obj' | 'text' })}
        >
          <option value="obj">Object (obj)</option>
          <option value="text">Text (text)</option>
        </select>
      </div>

      {box.mode === 'text' && (
        <div className="input-group">
          <label>Text Content</label>
          <input
            type="text"
            value={box.text}
            onChange={e => updateBox(box.id, { text: e.target.value })}
          />
        </div>
      )}

      <div className="input-group">
        <label>Description</label>
        <textarea
          value={box.desc}
          onChange={e => updateBox(box.id, { desc: e.target.value })}
        />
      </div>

      <ColorPalette
        label="Box Color Palette"
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
        Delete Box
      </button>
    </div>
  );
}