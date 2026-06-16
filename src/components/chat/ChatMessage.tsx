import type { ChatMessage as ChatMessageType } from '../../types/chat';
import { useI18n } from '../../i18n/context';

interface ChatMessageProps {
  message: ChatMessageType;
  onAdopt?: (messageId: string) => void;
  onDismiss?: (messageId: string) => void;
  dismissed?: boolean;
}

export default function ChatMessage({ message, onAdopt, onDismiss, dismissed }: ChatMessageProps) {
  const { t } = useI18n();

  if (message.role === 'user') {
    return (
      <div className="chat-bubble chat-bubble-user">
        {message.content}
      </div>
    );
  }

  return (
    <div className="chat-bubble chat-bubble-ai">
      {message.content}
      {message.adopted ? (
        <div className="chat-adopted-badge">
          ✓ {t('chat.adopted')}
        </div>
      ) : !dismissed && onAdopt && onDismiss ? (
        <div className="chat-bubble-actions">
          <button className="chat-adopt-btn" onClick={() => onAdopt(message.id)}>
            {t('chat.adopt')}
          </button>
          <button className="chat-dismiss-btn" onClick={() => onDismiss(message.id)}>
            {t('chat.dismiss')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
