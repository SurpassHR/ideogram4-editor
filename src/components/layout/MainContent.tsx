import Artboard from '../canvas/Artboard';
import JsonToolbar from '../json/JsonToolbar';
import ComfyUIControls from '../comfyui/ComfyUIControls';
import ImagePreview from '../comfyui/ImagePreview';
import RightPanelContainer from '../panels/RightPanelContainer';
import { useImageDrop } from '../../hooks/useImageDrop';
import { useI18n } from '../../i18n/context';

export default function MainContent() {
  useImageDrop();
  const { t } = useI18n();

  return (
    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
        <Artboard />
        <JsonToolbar />
        <ComfyUIControls />
        <ImagePreview />
      </div>

      <div style={{ width: '320px', flexShrink: 0 }}>
        <RightPanelContainer />
      </div>
    </div>
  );
}