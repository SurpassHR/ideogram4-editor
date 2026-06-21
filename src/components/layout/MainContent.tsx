import Artboard from '../canvas/Artboard';
import RightPanelContainer from '../panels/RightPanelContainer';
import { useImageDrop } from '../../hooks/useImageDrop';

export default function CanvasPage() {
  useImageDrop();

  return (
    <>
      {/* Main Content: 画板 + 右侧面板 */}
      <div style={{ display: 'flex', gap: '8px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
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
