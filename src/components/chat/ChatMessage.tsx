import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { ChatMessage as ChatMessageType } from '../../types/chat';
import { useI18n } from '../../i18n/context';
import { useEditorStore } from '../../store';
import { extractAndValidateIdeogramJSON } from '../../services/llm-canvas-chat';

interface ChatMessageProps {
  message: ChatMessageType;
  onAdopt?: (messageId: string) => void;
  onDismiss?: (messageId: string) => void;
  onApply?: (messageId: string) => void;
  dismissed?: boolean;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** 将 markdown 字符串安全渲染为 HTML */
function renderMarkdown(text: string): string {
  const raw = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'a', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });
}

export default function ChatMessage({ message, onAdopt, onDismiss, onApply, dismissed }: ChatMessageProps) {
  const { t, lang } = useI18n();
  const timeLabel = useMemo(() => formatTime(message.timestamp), [message.timestamp]);

  const isUser = message.role === 'user';
  const roleLabel = isUser ? t('chat.you') : 'AI';
  const avatarLetter = isUser ? 'U' : 'A';
  const responseLang = useEditorStore(s => s.chatResponseLang);
  const isChinese = responseLang === 'zh' || (responseLang === 'auto' && lang === 'zh');

  const parsedOutput = useMemo(
    () => (isUser ? null : extractAndValidateIdeogramJSON(message.content)),
    [isUser, message.content],
  );
  const showApply = parsedOutput !== null && !!onApply && !message.applied;
  const showAppliedBadge = parsedOutput !== null && !!onApply && !!message.applied;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      // 降级：fallback 静默忽略
    }
  };

  return (
    <div className={`chat-msg-card ${isUser ? 'user' : 'assistant'}`}>
      {/* 标签栏 */}
      <div className="chat-msg-card-header">
        <span className="chat-msg-card-avatar">{avatarLetter}</span>
        <span className="chat-msg-card-role">{roleLabel}</span>
        <span className="chat-msg-card-spacer" />
        <span className="chat-msg-card-time">{timeLabel}</span>
      </div>
      {/* 画布缩略图（仅 assistant 消息） */}
      {!isUser && message.canvasSnapshotUrl && (
        <div className="chat-msg-thumb-container">
          <img
            src={message.canvasSnapshotUrl}
            className="chat-msg-canvas-thumb"
            alt="Canvas preview"
          />
        </div>
      )}

      {/* 思维链折叠块（仅 assistant 消息有 thinking） */}
      {!isUser && message.thinking && (
        <details className="chat-thinking-block">
          <summary>
            {isChinese ? '🧠 思考过程' : '🧠 Reasoning'}
          </summary>
          <div
            className="chat-thinking-content"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.thinking) }}
          />
        </details>
      )}

      {/* 消息正文 */}
      <div
        className="chat-msg-card-body"
        dangerouslySetInnerHTML={
          isUser
            ? undefined
            : { __html: renderMarkdown(message.content) }
        }
      >
        {isUser ? message.content : null}
      </div>

      {/* 操作栏：已采纳 / 采纳+忽略+复制 / 仅复制（用户消息） */}
      {isUser ? (
        <div className="chat-msg-card-actions">
          <span className="chat-msg-card-actions-spacer" />
          <button className="chat-copy-btn" onClick={handleCopy} title={t('chat.copy')}>📋</button>
        </div>
      ) : message.adopted ? (
        <div className="chat-msg-card-actions">
          <span className="chat-adopted-badge">✓ {t('chat.adopted')}</span>
          <span className="chat-msg-card-actions-spacer" />
          <button className="chat-copy-btn" onClick={handleCopy} title={t('chat.copy')}>📋</button>
        </div>
      ) : dismissed ? null : (
        <div className="chat-msg-card-actions">
          {onAdopt && (
            <button className="chat-adopt-btn" onClick={() => onAdopt(message.id)}>
              {t('chat.adopt')}
            </button>
          )}
          {onDismiss && (
            <button className="chat-dismiss-btn" onClick={() => onDismiss(message.id)}>
              {t('chat.dismiss')}
            </button>
          )}
          <span className="chat-msg-card-actions-spacer" />
          <button className="chat-copy-btn" onClick={handleCopy} title={t('chat.copy')}>📋</button>
          {showApply && (
            <button
              type="button"
              className="chat-msg-card-apply-ghost"
              onClick={() => onApply!(message.id)}
              aria-label="Apply this composition to canvas"
              title="Apply this composition to canvas"
            >
              Apply
            </button>
          )}
          {showAppliedBadge && (
            <span className="chat-msg-card-applied-badge" aria-label="Composition applied to canvas">
              ✓ Applied
            </span>
          )}
        </div>
      )}
    </div>
  );
}