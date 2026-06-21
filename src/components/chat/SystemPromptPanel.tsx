import { useState, useEffect } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import { CANVAS_CHAT_SYSTEM_PROMPT } from '../../services/llm-canvas-chat';
import { BOX_CHAT_SYSTEM_PROMPT } from '../../services/llm-chat';
import { IconClose } from '../ui/icons';

interface Props {
  embedded?: boolean;
  onClose?: () => void;
}

export default function SystemPromptPanel({ embedded, onClose }: Props) {
  const canvasChatSystemPrompt = useEditorStore(s => s.canvasChatSystemPrompt);
  const boxChatSystemPrompt = useEditorStore(s => s.boxChatSystemPrompt);
  const setCanvasChatSystemPrompt = useEditorStore(s => s.setCanvasChatSystemPrompt);
  const setBoxChatSystemPrompt = useEditorStore(s => s.setBoxChatSystemPrompt);
  const { t } = useI18n();

  const [canvasText, setCanvasText] = useState(canvasChatSystemPrompt || CANVAS_CHAT_SYSTEM_PROMPT);
  const [boxText, setBoxText] = useState(boxChatSystemPrompt || BOX_CHAT_SYSTEM_PROMPT);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setCanvasText(canvasChatSystemPrompt || CANVAS_CHAT_SYSTEM_PROMPT);
  }, [canvasChatSystemPrompt]);

  useEffect(() => {
    setBoxText(boxChatSystemPrompt || BOX_CHAT_SYSTEM_PROMPT);
  }, [boxChatSystemPrompt]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleApplyCanvas = () => {
    const trimmed = canvasText.trim();
    if (trimmed === CANVAS_CHAT_SYSTEM_PROMPT) {
      setCanvasChatSystemPrompt(null);
      showToast('Default Canvas Chat prompt restored');
    } else {
      setCanvasChatSystemPrompt(trimmed);
      showToast('Canvas Chat prompt saved');
    }
  };

  const handleApplyBox = () => {
    const trimmed = boxText.trim();
    if (trimmed === BOX_CHAT_SYSTEM_PROMPT) {
      setBoxChatSystemPrompt(null);
      showToast('Default Box Chat prompt restored');
    } else {
      setBoxChatSystemPrompt(trimmed);
      showToast('Box Chat prompt saved');
    }
  };

  const handleResetCanvas = () => {
    setCanvasText(CANVAS_CHAT_SYSTEM_PROMPT);
    setCanvasChatSystemPrompt(null);
    showToast('Canvas Chat prompt reset to default');
  };

  const handleResetBox = () => {
    setBoxText(BOX_CHAT_SYSTEM_PROMPT);
    setBoxChatSystemPrompt(null);
    showToast('Box Chat prompt reset to default');
  };

  const content = (
    <>
      <div className="modal-header">
        <h3>{t('chat.systemPrompt.title')}</h3>
        {!embedded && onClose && (
          <button className="modal-close-btn" onClick={onClose}><IconClose size={14} /></button>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}

      <div className="sysprompt-info">
        {t('chat.systemPrompt.info')}
      </div>

      <div className="sysprompt-section">
        <div className="sysprompt-section-header">
          <div>
            <div className="sysprompt-section-title">{t('chat.systemPrompt.canvasTitle')}</div>
            <div className="sysprompt-section-sub">{t('chat.systemPrompt.canvasDesc')}</div>
          </div>
          <div className="sysprompt-actions">
            <button className="btn btn-danger btn-small" onClick={handleResetCanvas}>
              {t('chat.systemPrompt.reset')}
            </button>
            <button className="btn btn-primary btn-small" onClick={handleApplyCanvas}>
              {t('chat.systemPrompt.apply')}
            </button>
          </div>
        </div>
        <textarea
          className="sysprompt-textarea"
          value={canvasText}
          onChange={e => setCanvasText(e.target.value)}
          spellCheck={false}
        />
        <div className="sysprompt-footer">
          {canvasChatSystemPrompt ? (
            <span className="sysprompt-status custom">{t('chat.systemPrompt.customized')}</span>
          ) : (
            <span className="sysprompt-status default">{t('chat.systemPrompt.default')}</span>
          )}
          <span className="sysprompt-char-count">{canvasText.length} chars</span>
        </div>
      </div>

      <div className="sysprompt-section">
        <div className="sysprompt-section-header">
          <div>
            <div className="sysprompt-section-title">{t('chat.systemPrompt.boxTitle')}</div>
            <div className="sysprompt-section-sub">{t('chat.systemPrompt.boxDesc')}</div>
          </div>
          <div className="sysprompt-actions">
            <button className="btn btn-danger btn-small" onClick={handleResetBox}>
              {t('chat.systemPrompt.reset')}
            </button>
            <button className="btn btn-primary btn-small" onClick={handleApplyBox}>
              {t('chat.systemPrompt.apply')}
            </button>
          </div>
        </div>
        <textarea
          className="sysprompt-textarea"
          value={boxText}
          onChange={e => setBoxText(e.target.value)}
          spellCheck={false}
        />
        <div className="sysprompt-footer">
          {boxChatSystemPrompt ? (
            <span className="sysprompt-status custom">{t('chat.systemPrompt.customized')}</span>
          ) : (
            <span className="sysprompt-status default">{t('chat.systemPrompt.default')}</span>
          )}
          <span className="sysprompt-char-count">{boxText.length} chars</span>
        </div>
      </div>
    </>
  );

  if (embedded) {
    return <div className="sysprompt-embedded">{content}</div>;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content sysprompt-modal" onClick={e => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}
