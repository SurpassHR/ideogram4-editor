import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import { MODE_PHOTO } from '../../types';
import { IconBrain } from '../ui/icons';

export default function BottomBar() {
  const boxes = useEditorStore(s => s.boxes);
  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const photoArtStyleMode = useEditorStore(s => s.photoArtStyleMode);
  const isCanvasChatOpen = useEditorStore(s => s.isCanvasChatOpen);
  const setCanvasChatOpen = useEditorStore(s => s.setCanvasChatOpen);
  const { t } = useI18n();

  const modeLabel = photoArtStyleMode === MODE_PHOTO ? 'Photo' : 'Art Style';
  const status = `${boxes.length} boxes · ${canvasW}×${canvasH} · ${modeLabel}`;

  return (
    <footer className="bottom-bar">
      <div className="bottom-bar-inner">
        {/* 左侧：Canvas Chat 入口 */}
        <button
          className={`btn bottom-chat-btn ${isCanvasChatOpen ? 'active' : ''}`}
          onClick={() => setCanvasChatOpen(!isCanvasChatOpen)}
          title={t('canvasChat.title')}
        >
          <IconBrain size={14} />
          <span className="bottom-chat-label">Canvas Chat</span>
        </button>

        {/* 中间：状态信息 */}
        <span className="bottom-status">{status}</span>
      </div>
    </footer>
  );
}
