import { useState } from 'react';
import { useEditorStore } from '../../store';

export default function HeaderControls() {
  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const setCanvasDimensions = useEditorStore(s => s.setCanvasDimensions);
  const resetCanvas = useEditorStore(s => s.resetCanvas);

  const [wDisplay, setWDisplay] = useState(String(canvasW).padStart(4, '0'));
  const [hDisplay, setHDisplay] = useState(String(canvasH).padStart(4, '0'));

  return (
    <div className="panel" style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
      <div className="input-group" style={{ margin: 0, flex: 1, minWidth: 200 }}>
        <label>Width: <span>{wDisplay}</span></label>
        <input
          type="range"
          min={256}
          max={4096}
          step={16}
          value={canvasW}
          onChange={e => {
            setWDisplay(e.target.value.padStart(4, '0'));
          }}
          onMouseUp={e => {
            const w = parseInt((e.target as HTMLInputElement).value);
            setCanvasDimensions(w, canvasH);
          }}
        />
      </div>
      <div className="input-group" style={{ margin: 0, flex: 1, minWidth: 200 }}>
        <label>Height: <span>{hDisplay}</span></label>
        <input
          type="range"
          min={256}
          max={4096}
          step={16}
          value={canvasH}
          onChange={e => {
            setHDisplay(e.target.value.padStart(4, '0'));
          }}
          onMouseUp={e => {
            const h = parseInt((e.target as HTMLInputElement).value);
            setCanvasDimensions(canvasW, h);
          }}
        />
      </div>
      <button className="btn" onClick={resetCanvas}>Go (Reset Canvas)</button>
    </div>
  );
}