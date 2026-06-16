import { useState, useLayoutEffect, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/context';
import { useChatPanel } from '../../hooks/useChatPanel';
import ChatMessage from './ChatMessage';
import LlmConfigPanel from '../llm/LlmConfigPanel';

export default function ChatPanel() {
  const {
    isChatOpen,
    activeChatBoxId,
    currentBox,
    messages,
    modelOptions,
    chatModel,
    isLoading,
    error,
    sendMessage,
    adoptResponse,
    dismissResponse,
    handleClearHistory,
    handleClose,
    handleSelectModel,
    refreshProviders,
  } = useChatPanel();

  const { t } = useI18n();
  const [inputText, setInputText] = useState('');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [showLlmConfig, setShowLlmConfig] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });

  // 计算面板位置：box 下方偏右，避免超出视口
  useLayoutEffect(() => {
    if (!isChatOpen || !activeChatBoxId) return;
    const boxEl = document.getElementById(activeChatBoxId);
    if (!boxEl) {
      // box 元素不存在，居中显示
      setPanelPos({
        top: Math.round(window.innerHeight / 2 - 200),
        left: Math.round(window.innerWidth / 2 - 160),
      });
      return;
    }
    const rect = boxEl.getBoundingClientRect();
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;

    let top = rect.bottom + 8;
    let left = rect.left;

    // 右侧偏移：尽量在 box 下方右对齐
    if (left + 320 > vpW) left = vpW - 320 - 10;
    if (left < 10) left = 10;

    // 上方偏移：如果下方空间不足，显示在 box 上方
    if (top + 400 > vpH) top = rect.top - 400 - 8;
    if (top < 10) top = 10;

    setPanelPos({ top: Math.round(top), left: Math.round(left) });
  }, [isChatOpen, activeChatBoxId]);

  // 定期更新位置（处理 zoom/pan 变化）
  useEffect(() => {
    if (!isChatOpen || !activeChatBoxId) return;
    const interval = setInterval(() => {
      const boxEl = document.getElementById(activeChatBoxId);
      if (!boxEl) return;
      const rect = boxEl.getBoundingClientRect();
      const vpW = window.innerWidth;
      const vpH = window.innerHeight;

      let top = rect.bottom + 8;
      let left = rect.left;

      if (left + 320 > vpW) left = vpW - 320 - 10;
      if (left < 10) left = 10;
      if (top + 400 > vpH) top = rect.top - 400 - 8;
      if (top < 10) top = 10;

      setPanelPos({ top: Math.round(top), left: Math.round(left) });
    }, 300);
    return () => clearInterval(interval);
  }, [isChatOpen, activeChatBoxId]);

  // 新消息自动滚动到底部
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, isLoading]);

  // 处理忽略
  const handleDismiss = useCallback((messageId: string) => {
    setDismissedIds(prev => new Set(prev).add(messageId));
    dismissResponse(messageId);
  }, [dismissResponse]);

  // 处理发送
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText('');
    sendMessage(text);
  }, [inputText, isLoading, sendMessage]);

  // 处理 Enter 键
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // 配置面板关闭回调
  const handleLlmConfigClose = useCallback(() => {
    setShowLlmConfig(false);
    refreshProviders();
  }, [refreshProviders]);

  if (!isChatOpen) return null;

  const hasProviders = modelOptions.length > 0;

  const panelContent = (
    <div className="chat-panel" style={{ top: panelPos.top, left: panelPos.left }}>
      {/* Header */}
      <div className="chat-header">
        <span className="chat-header-title">{t('chat.title')}</span>
        {currentBox && (
          <span className="chat-badge">
            {t('chat.boxBadge', { name: currentBox.desc || currentBox.text || currentBox.id })}
          </span>
        )}
        {hasProviders ? (
          <select
            className="chat-model-select"
            value={chatModel}
            onChange={e => handleSelectModel(e.target.value)}
          >
            {!chatModel && <option value="">{t('chat.modelSelect')}</option>}
            {modelOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : (
          <span className="chat-no-model-label">{t('chat.noProvider')}</span>
        )}
        <button className="chat-clear-btn" onClick={handleClearHistory} title={t('chat.clearHistory')}>
          🗑
        </button>
        <button className="chat-close-btn" onClick={handleClose} title="Close">
          ✕
        </button>
      </div>

      {/* 无 LLM 配置提示 */}
      {!hasProviders && (
        <div className="chat-no-provider">
          <p>{t('chat.noProvider')}</p>
          <button className="btn" onClick={() => setShowLlmConfig(true)} style={{ fontSize: 12, padding: '5px 14px' }}>
            {t('chat.configureLlm')}
          </button>
        </div>
      )}

      {/* Messages */}
      {hasProviders && (
        <div className="chat-messages" ref={messagesRef}>
          {messages.length === 0 && !isLoading && (
            <div className="chat-empty-hint">
              {t('chat.emptyHint')}
            </div>
          )}
          {messages.map(msg => (
            <ChatMessage
              key={msg.id}
              message={msg}
              onAdopt={msg.role === 'assistant' ? adoptResponse : undefined}
              onDismiss={msg.role === 'assistant' ? handleDismiss : undefined}
              dismissed={dismissedIds.has(msg.id)}
            />
          ))}
          {isLoading && (
            <div className="chat-loading">{t('chat.loading')}</div>
          )}
          {error && (
            <div className="chat-error">{t('chat.error', { error })}</div>
          )}
        </div>
      )}

      {/* Input */}
      {hasProviders && (
        <div className="chat-input-area">
          <input
            className="chat-input"
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.inputPlaceholder')}
            disabled={isLoading}
          />
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={isLoading || !inputText.trim()}
            title={t('chat.send')}
          >
            ➤
          </button>
        </div>
      )}

      {/* LLM 配置面板 */}
      {showLlmConfig && (
        <LlmConfigPanel onClose={handleLlmConfigClose} />
      )}
    </div>
  );

  return createPortal(panelContent, document.body);
}
