import { useState, useLayoutEffect, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/context';
import { useChatPanel } from '../../hooks/useChatPanel';
import ChatMessage from './ChatMessage';
import LlmConfigPanel from '../llm/LlmConfigPanel';
import PresetManagerPanel from './PresetManagerPanel';
import { computeChatPanelPosition } from '../../utils/panelPosition';
import { resolveTemplate } from '../../utils/resolveTemplate';

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
    chatPresets,
    selectedPreset,
    handleSelectPreset,
    chatResponseLang,
    setChatResponseLang,
  } = useChatPanel();

  const { t } = useI18n();
  const [inputText, setInputText] = useState('');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [showLlmConfig, setShowLlmConfig] = useState(false);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });

  // 获取容器（Artboard）的边界矩形，未找到则回退到视口
  const getArtboardRect = useCallback(() => {
    const artboardEl = document.querySelector('.artboard');
    if (artboardEl) {
      const r = artboardEl.getBoundingClientRect();
      return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    }
    return {
      top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight,
      width: window.innerWidth, height: window.innerHeight,
    };
  }, []);

  // 计算面板初始位置
  useLayoutEffect(() => {
    if (!isChatOpen || !activeChatBoxId) return;
    const boxEl = document.getElementById(activeChatBoxId);
    if (!boxEl) {
      setPanelPos({
        top: Math.round(window.innerHeight / 2 - 200),
        left: Math.round(window.innerWidth / 2 - 160),
      });
      return;
    }
    const rect = boxEl.getBoundingClientRect();
    const boxRect = { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    const containerRect = getArtboardRect();
    setPanelPos(computeChatPanelPosition(boxRect, containerRect, 320, 400, 10));
  }, [isChatOpen, activeChatBoxId, getArtboardRect]);

  // rAF 跟随 box 移动
  useEffect(() => {
    if (!isChatOpen || !activeChatBoxId) return;
    let rafId: number;
    const track = () => {
      const boxEl = document.getElementById(activeChatBoxId);
      const panelEl = panelRef.current;
      if (!boxEl || !panelEl) {
        rafId = requestAnimationFrame(track);
        return;
      }
      const rect = boxEl.getBoundingClientRect();
      const boxRect = { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      const containerRect = getArtboardRect();
      const actualH = panelEl.offsetHeight || 400;
      const pos = computeChatPanelPosition(boxRect, containerRect, 320, actualH, 10);
      panelEl.style.top = `${pos.top}px`;
      panelEl.style.left = `${pos.left}px`;
      rafId = requestAnimationFrame(track);
    };
    rafId = requestAnimationFrame(track);
    return () => cancelAnimationFrame(rafId);
  }, [isChatOpen, activeChatBoxId, getArtboardRect]);

  // 新消息自动滚动
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, isLoading]);

  const handleDismiss = useCallback((messageId: string) => {
    setDismissedIds(prev => new Set(prev).add(messageId));
    dismissResponse(messageId);
  }, [dismissResponse]);

  // 发送：若选中预设则先解析模板变量再发送
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText('');
    // 解析预设模板变量
    const resolvedText = selectedPreset && currentBox
      ? resolveTemplate(text, currentBox)
      : text;
    sendMessage(resolvedText);
    handleSelectPreset(null); // 发送后清除预设选择
  }, [inputText, isLoading, sendMessage, selectedPreset, currentBox, handleSelectPreset]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleLlmConfigClose = useCallback(() => {
    setShowLlmConfig(false);
    refreshProviders();
  }, [refreshProviders]);

  const handlePresetManagerClose = useCallback(() => {
    setShowPresetManager(false);
  }, []);

  // 选中预设：将模板文本填入输入框
  const handlePresetChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const presetId = e.target.value;
    if (!presetId) {
      handleSelectPreset(null);
      return;
    }
    // "__new__" 选项打开预设管理器
    if (presetId === '__new__') {
      handleSelectPreset(null);
      setShowPresetManager(true);
      return;
    }
    handleSelectPreset(presetId);
    const preset = chatPresets.find(p => p.id === presetId);
    if (preset) {
      setInputText(preset.promptTemplate);
    }
  }, [chatPresets, handleSelectPreset]);

  if (!isChatOpen) return null;

  const hasProviders = modelOptions.length > 0;

  const panelContent = (
    <div className="chat-panel" ref={panelRef} style={{ top: panelPos.top, left: panelPos.left }}>
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-row">
          <span className="chat-header-title">{t('chat.title')}</span>
          {currentBox && (
            <span className="chat-badge">
              {t('chat.boxBadge', { name: currentBox.desc || currentBox.text || currentBox.id })}
            </span>
          )}
          <div className="chat-header-spacer" />
          <button className="chat-close-btn" onClick={handleClose} title="Close">
            ✕
          </button>
        </div>

        {/* Controls row */}
        {hasProviders && (
          <div className="chat-header-controls">
            {chatPresets.length > 0 && (
              <select
                className="chat-preset-select"
                value={selectedPreset?.id || ''}
                onChange={handlePresetChange}
              >
                <option value="">预设</option>
                {chatPresets.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}

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

            <select
              className="chat-lang-select"
              value={chatResponseLang}
              onChange={e => setChatResponseLang(e.target.value)}
            >
              <option value="auto">🌐</option>
              <option value="en">EN</option>
              <option value="zh">中</option>
            </select>

            <button className="chat-preset-mgr-btn" onClick={() => setShowPresetManager(true)} title={t('chat.presets.manage')}>
              ⚙
            </button>
            <button className="chat-clear-btn" onClick={handleClearHistory} title={t('chat.clearHistory')}>
              🗑
            </button>
          </div>
        )}
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
            <div className="chat-empty-hint">{t('chat.emptyHint')}</div>
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
          {isLoading && <div className="chat-loading">{t('chat.loading')}</div>}
          {error && <div className="chat-error">{t('chat.error', { error })}</div>}
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
      {showLlmConfig && <LlmConfigPanel onClose={handleLlmConfigClose} />}

      {/* 预设管理面板 */}
      {showPresetManager && <PresetManagerPanel onClose={handlePresetManagerClose} />}
    </div>
  );

  return createPortal(panelContent, document.body);
}