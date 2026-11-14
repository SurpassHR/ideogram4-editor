import Artboard from '../canvas/Artboard';
import RightPanelDock from './RightPanelDock';
import { useImageDrop } from '../../hooks/useImageDrop';

export default function CanvasPage() {
  useImageDrop();

  return (
    <div className="canvas-workspace">
      <div className="canvas-workspace-main">
        <Artboard />
      </div>
      <RightPanelDock />
    </div>
  );
}
