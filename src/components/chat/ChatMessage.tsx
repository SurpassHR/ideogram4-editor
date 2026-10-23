import { useMemo, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { ChatMessage as ChatMessageType } from '../../types/chat';
import { useI18n } from '../../i18n/context';
import { useEditorStore } from '../../store';
import { IconCopy, IconRefresh } from '../ui/icons';
import { validateIdeogramJSONVerbose } from '../../services/llm-canvas-chat';
import { parseContentSegments } from '../../utils/code-block-parser';
import { highlightJson } from '../../utils/json-highlight';
import JsonCodeBlock from './JsonCodeBlock';
import ImageLightbox from './ImageLightbox';
import { IconBrain, IconPencil } from '../ui/icons';

/** 消息正文的渲染方式 */
export type ChatMessageRenderMode = 'json' | 'summary';

interface ChatMessageProps {
  message: ChatMessageType;
  onAdopt?: (messageId: string) => void;
  onDismiss?: (messageId: string) => void;
  onApply?: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  onEdit?: (messageId: string) => void;
  dismissed?: boolean;
  isLoading?: boolean;
  /**
   * 判断回复能否 Apply（决定 Apply 按钮是否出现）。
   * 缺省用 Ideogram 校验；Canvas Chat 会传入按当前 skill 解析的检查函数。
   */
  outputCheck?: (message: ChatMessageType) => { canApply: boolean; error: string | null };
  /**
   * 正文渲染方式：
   * - 'json'（默认）：完整展示模型输出，含 JSON 代码块（per-box Chat 使用）
   * - 'summary'：只展示一行自然语言摘要 + 画布缩略图，不暴露 JSON（Canvas Chat 使用）
   */
  renderMode?: ChatMessageRenderMode;
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

export default function ChatMessage({ message, onAdopt, onDismiss, onApply, onRetry, onEdit, dismissed, isLoading, outputCheck, renderMode = 'json' }: ChatMessageProps) {
  const { t, lang } = useI18n();
  const timeLabel = useMemo(() => formatTime(message.timestamp), [message.timestamp]);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const isUser = message.role === 'user';
  const roleLabel = isUser ? t('chat.you') : 'AI';
  const avatarLetter = isUser ? 'U' : 'A';
  const responseLang = useEditorStore(s => s.chatResponseLang);
  const showDeveloperTools = useEditorStore(s => s.showDeveloperTools);
  const isChinese = responseLang === 'zh' || (responseLang === 'auto' && lang === 'zh');
  const isSummaryMode = renderMode === 'summary';

  const parseResult = useMemo(
    () => {
      if (isUser) return null;
      if (outputCheck) return outputCheck(message);
      const ideogramResult = validateIdeogramJSONVerbose(message.content);
      return { canApply: ideogramResult.output !== null, error: ideogramResult.error };
    },
    [isUser, message.content, outputCheck],
  );
  const parseError = parseResult?.error ?? null;
  const hasOutput = (parseResult?.canApply ?? false) && !!onApply;
  const showApply = hasOutput;
  const applyLabel = message.applied ? 'Re-Apply' : 'Apply';

  /** summary 模式下的摘要文案：优先消息自带 summary，其次回退到元素数量 */
  const summaryText = useMemo(() => {
    if (!isSummaryMode || isUser) return '';
    if (message.summary?.trim()) return message.summary.trim();
    if (typeof message.elementCount === 'number') {
      return t('chat.summaryFallback', { count: message.elementCount });
    }
    return '';
  }, [isSummaryMode, isUser, message.summary, message.elementCount, t]);

  /** summary 模式：剔除 JSON 代码块与纯 JSON 段，只留模型的散文说明 */
  const proseSegments = useMemo(() => {
    if (!isSummaryMode || isUser) return [];
    const out: string[] = [];
    for (const seg of parseContentSegments(message.content)) {
      if (seg.type === 'text') {
        if (!isJsonText(seg.text) && seg.text.trim()) out.push(seg.text);
      } else if (seg.lang !== 'json' && seg.code.trim()) {
        out.push('```' + seg.lang + '\n' + seg.code + '\n```');
      }
    }
    return out;
  }, [isSummaryMode, isUser, message.content]);

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
        {!isUser && parseError && !isSummaryMode && (
          <span className="chat-parse-error-icon" title={parseError}>!</span>
        )}
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
        ) : isSummaryMode ? (
          /* summary 模式：一行人话摘要 + 画布缩略图，绝不暴露 JSON */
          <>
            {summaryText && (
              <div className="chat-msg-summary">{summaryText}</div>
            )}
            {message.canvasSnapshotUrl && (
              <button
                type="button"
                className="chat-msg-thumbnail"
                onClick={() => setLightboxOpen(true)}
                aria-label={t('chat.previewAlt')}
                title={t('chat.previewAlt')}
              >
                <img src={message.canvasSnapshotUrl} alt={t('chat.previewAlt')} draggable={false} />
              </button>
            )}
            {/* 模型没按格式输出时的散文说明仍以 markdown 展示 */}
            {proseSegments.length > 0 && (
              <div className="chat-msg-prose">
                {proseSegments.map((prose, i) => (
                  <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(prose) }} />
                ))}
              </div>
            )}
            {parseError && (
              <div className="chat-msg-parse-hint">{t('chat.parseFailedHint')}</div>
            )}
            {showDeveloperTools && (
              <details className="chat-raw-output-block">
                <summary>{t('chat.showRawOutput')}</summary>
                <pre className="chat-raw-output-pre">
                  <code>{message.content}</code>
                </pre>
              </details>
            )}
          </>
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
              className={`chat-msg-card-apply-ghost${message.applied ? ' reapplied' : ''}`}
              onClick={() => onApply!(message.id)}
              aria-label={`${applyLabel} this composition to canvas`}
              title={`${applyLabel} this composition to canvas`}
            >
              {applyLabel}
            </button>
          )}
        </div>
      )}
      {lightboxOpen && message.canvasSnapshotUrl && (
        <ImageLightbox
          src={message.canvasSnapshotUrl}
          alt={t('chat.previewAlt')}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}
