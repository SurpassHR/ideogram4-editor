import { useState } from 'react';

interface ColorPaletteProps {
  label: string;
  colors: string[];
  maxColors: number;
  onAdd: (hex: string) => boolean;
  onRemove: (hex: string) => void;
}

export default function ColorPalette({ label, colors, maxColors, onAdd, onRemove }: ColorPaletteProps) {
  const [pickerColor, setPickerColor] = useState('#000000');

  const handleAdd = () => {
    const ok = onAdd(pickerColor);
    if (!ok) {
      alert(`Max ${maxColors} colors allowed.`);
    }
  };

  return (
    <div className="input-group">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="color"
          value={pickerColor}
          onChange={e => setPickerColor(e.target.value)}
          style={{ width: 36, height: 36, border: 'none', cursor: 'pointer', padding: 0 }}
        />
        <button className="btn" onClick={handleAdd} style={{ padding: '4px 12px' }}>Add</button>
      </div>
      <div className="color-list">
        {colors.map(hex => (
          <div
            key={hex}
            className="swatch"
            style={{ backgroundColor: hex }}
            onClick={() => onRemove(hex)}
          >
            x
          </div>
        ))}
      </div>
    </div>
  );
}