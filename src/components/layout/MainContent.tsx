import Artboard from '../canvas/Artboard';
import JsonToolbar from '../json/JsonToolbar';
import ComfyUIControls from '../comfyui/ComfyUIControls';
import ImagePreview from '../comfyui/ImagePreview';
import RightPanelContainer from '../panels/RightPanelContainer';
import { useImageDrop } from '../../hooks/useImageDrop';

export default function CanvasPage() {
  useImageDrop();

  return (
    <>
      {/* Main Content: 画板 + 右侧面板 */}
      <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Artboard />
        </div>

        <div style={{ width: '320px', flexShrink: 0 }}>
          <RightPanelContainer />
        </div>
      </div>
    </>
  );
}

export function CanvasBottom() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
      <JsonToolbar />
      <ComfyUIControls />
      <ImagePreview />
    </div>
  );
}
