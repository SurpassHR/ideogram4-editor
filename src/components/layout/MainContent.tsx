import CanvasArea from '../canvas/CanvasArea';
import JsonToolbar from '../json/JsonToolbar';
import ComfyUIControls from '../comfyui/ComfyUIControls';
import ImagePreview from '../comfyui/ImagePreview';
import GlobalSettingsPanel from '../panels/GlobalSettingsPanel';
import BoxPropertiesPanel from '../panels/BoxPropertiesPanel';
import LlmPanel from '../llm/LlmPanel';
import { useImageDrop } from '../../hooks/useImageDrop';
import { useI18n } from '../../i18n/context';

export default function MainContent() {
  useImageDrop();
  const { t } = useI18n();

  return (
    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <p className="instruction-text">
          {t('main.instruction')}
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