import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { ChatMessage as ChatMessageType } from '../../types/chat';
import { useI18n } from '../../i18n/context';
import { useEditorStore } from '../../store';
import { IconCopy, IconRefresh } from '../ui/icons';
import { extractAndValidateIdeogramJSON } from '../../services/llm-canvas-chat';
import { parseContentSegments } from '../../utils/code-block-parser';
import { highlightJson } from '../../utils/json-highlight';
import JsonCodeBlock from './JsonCodeBlock';
import { IconBrain, IconPencil } from '../ui/icons';

interface ChatMessageProps {
  message: ChatMessageType;
  onAdopt?: (messageId: string) => void;
  onDismiss?: (messageId: string) => void;
  onApply?: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  onEdit?: (messageId: string) => void;
  dismissed?: boolean;
  isLoading?: boolean;
}

/** 检测纯文本是否为有效 JSON（用于兜底渲染 models 不返回 ```json 的情况） */
function isJsonText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
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

export default function ChatMessage({ message, onAdopt, onDismiss, onApply, onRetry, onEdit, dismissed, isLoading }: ChatMessageProps) {
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


      {/* 思维链折叠块（仅 assistant 消息有 thinking） */}
      {!isUser && message.thinking && (
        <details className="chat-thinking-block">
          <summary>
            <IconBrain size={12} /> {isChinese ? '思考过程' : 'Reasoning'}
          </summary>
          <div
            className="chat-thinking-content"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.thinking) }}
          />
        </details>
      )}

      {/* 消息正文 */}
      <div className="chat-msg-card-body">
        {isUser ? (
          message.content
        ) : (
          parseContentSegments(message.content).map((seg, i) => {
            if (seg.type === 'code' && seg.lang === 'json' && message.canvasSnapshotUrl) {
              if (!seg.code.trim()) {
                return <pre key={i}><code>{seg.code}</code></pre>;
              }
              return <JsonCodeBlock key={i} json={seg.code} snapshotUrl={message.canvasSnapshotUrl} />;
            }
            if (seg.type === 'code') {
              // JSON 代码块使用语法高亮渲染
              if (seg.lang === 'json') {
                return (
                  <pre key={i}>
                    <code
                      className="language-json"
                      dangerouslySetInnerHTML={{ __html: highlightJson(seg.code) }}
                    />
                  </pre>
                );
              }
              return (
                <pre key={i}>
                  <code className={seg.lang ? `language-${seg.lang}` : ''}>{seg.code}</code>
                </pre>
              );
            }
            // 兜底：LLM 可能返回纯 JSON 而不包裹 ```json 代码块
            if (isJsonText(seg.text)) {
              if (message.canvasSnapshotUrl) {
                return <JsonCodeBlock key={i} json={seg.text} snapshotUrl={message.canvasSnapshotUrl} />;
              }
              return (
                <pre key={i}>
                  <code
                    className="language-json"
                    dangerouslySetInnerHTML={{ __html: highlightJson(seg.text) }}
                  />
                </pre>
              );
            }
            return (
              <div
                key={i}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(seg.text) }}
              />
            );
          })
        )}
      </div>

      {/* 操作栏：已采纳 / 采纳+忽略+重试+复制 / 仅复制+编辑（用户消息） */}
      {isUser ? (
        <div className="chat-msg-card-actions">
          {onEdit && !isLoading && (
            <button className="chat-edit-btn" onClick={() => onEdit(message.id)} title={t('chat.edit')}>
              <IconPencil size={12} />
            </button>
          )}
          <span className="chat-msg-card-actions-spacer" />
          <button className="chat-copy-btn" onClick={handleCopy} title={t('chat.copy')}><IconCopy size={12} /></button>
        </div>
      ) : message.adopted ? (
        <div className="chat-msg-card-actions">
          <span className="chat-adopted-badge">✓ {t('chat.adopted')}</span>
          <span className="chat-msg-card-actions-spacer" />
          {onRetry && !isLoading && (
            <button className="chat-retry-btn" onClick={() => onRetry(message.id)} title={t('chat.retry')}>
              <IconRefresh size={12} />
            </button>
          )}
          <button className="chat-copy-btn" onClick={handleCopy} title={t('chat.copy')}><IconCopy size={12} /></button>
        </div>
      ) : dismissed ? (
        <div className="chat-msg-card-actions">
          {onRetry && !isLoading && (
            <button className="chat-retry-btn" onClick={() => onRetry(message.id)} title={t('chat.retry')}>
              <IconRefresh size={12} />
            </button>
          )}
          <span className="chat-msg-card-actions-spacer" />
        </div>
      ) : (
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
          {onRetry && !isLoading && (
            <button className="chat-retry-btn" onClick={() => onRetry(message.id)} title={t('chat.retry')}>
              <IconRefresh size={12} />
            </button>
          )}
          <button className="chat-copy-btn" onClick={handleCopy} title={t('chat.copy')}><IconCopy size={12} /></button>
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