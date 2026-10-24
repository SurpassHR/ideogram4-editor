import { useEditorStore } from '../../store';
import { MODE_PHOTO } from '../../types';

export default function BottomBar() {
  const boxes = useEditorStore(s => s.boxes);
  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const photoArtStyleMode = useEditorStore(s => s.photoArtStyleMode);

  const modeLabel = photoArtStyleMode === MODE_PHOTO ? 'Photo' : 'Art Style';
  const status = `${boxes.length} boxes · ${canvasW}×${canvasH} · ${modeLabel}`;

  return (
    <footer className="bottom-bar">
      <div className="bottom-bar-inner" style={{ justifyContent: 'center' }}>
        <span className="bottom-status">{status}</span>
      </div>
    </footer>
  );
}

