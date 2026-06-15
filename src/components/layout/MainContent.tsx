import CanvasArea from '../canvas/CanvasArea';
import JsonToolbar from '../json/JsonToolbar';
import ComfyUIControls from '../comfyui/ComfyUIControls';
import ImagePreview from '../comfyui/ImagePreview';
import GlobalSettingsPanel from '../panels/GlobalSettingsPanel';
import BoxPropertiesPanel from '../panels/BoxPropertiesPanel';
import LlmPanel from '../llm/LlmPanel';
import { useImageDrop } from '../../hooks/useImageDrop';

export default function MainContent() {
  useImageDrop();

  return (
    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
          Click and drag on the canvas to create a bounding box. Drag and drop a PNG to import.
        </p>
        <CanvasArea />
        <JsonToolbar />
        <ComfyUIControls />
        <ImagePreview />
      </div>

      <div style={{ width: '35%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <GlobalSettingsPanel />
        <BoxPropertiesPanel />
        <LlmPanel />
      </div>
    </div>
  );
}