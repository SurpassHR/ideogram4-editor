import { useState, useLayoutEffect, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/context';
import { useChatPanel } from '../../hooks/useChatPanel';
import ChatMessage from './ChatMessage';
import SelectMenu from './SelectMenu';
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
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
    const panelW = panelRef.current?.offsetWidth || 360;
    const panelH = panelRef.current?.offsetHeight || 400;
    setPanelPos(computeChatPanelPosition(boxRect, containerRect, panelW, panelH, 10));
  }, [isChatOpen, activeChatBoxId, getArtboardRect]);

  // rAF 跟随 box 移动（带阈值优化 + ResizeObserver）
  useEffect(() => {
    if (!isChatOpen || !activeChatBoxId) return;

    const boxEl = document.getElementById(activeChatBoxId);
    if (!boxEl) return;

    const panelEl = panelRef.current;
    if (!panelEl) return;

    let rafId: number;
    let lastBoxTop = 0;
    let lastBoxLeft = 0;
    let lastBoxW = 0;
    let lastBoxH = 0;
    const THRESHOLD = 2;
    const containerRect = getArtboardRect();

    const recalcPosition = () => {
      const rect = boxEl.getBoundingClientRect();
      const boxRect = {
        top: rect.top, left: rect.left, right: rect.right,
        bottom: rect.bottom, width: rect.width, height: rect.height,
      };
      const actualW = panelEl.offsetWidth || 360;
      const actualH = panelEl.offsetHeight || 400;
      return computeChatPanelPosition(boxRect, containerRect, actualW, actualH, 10);
    };

    const track = () => {
      const rect = boxEl.getBoundingClientRect();
      const newTop = Math.round(rect.top);
      const newLeft = Math.round(rect.left);
      const newW = Math.round(rect.width);
      const newH = Math.round(rect.height);

      if (
        Math.abs(newTop - lastBoxTop) > THRESHOLD ||
        Math.abs(newLeft - lastBoxLeft) > THRESHOLD ||
        Math.abs(newW - lastBoxW) > THRESHOLD ||
        Math.abs(newH - lastBoxH) > THRESHOLD
      ) {
        const pos = recalcPosition();
        panelEl.style.top = `${pos.top}px`;
        panelEl.style.left = `${pos.left}px`;
        lastBoxTop = newTop;
        lastBoxLeft = newLeft;
        lastBoxW = newW;
        lastBoxH = newH;
      }
      rafId = requestAnimationFrame(track);
    };

    const ro = new ResizeObserver(() => {
      const pos = recalcPosition();
      panelEl.style.top = `${pos.top}px`;
      panelEl.style.left = `${pos.left}px`;
    });
    ro.observe(boxEl);

    rafId = requestAnimationFrame(track);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [isChatOpen, activeChatBoxId, getArtboardRect]);

  // 新消息自动滚动
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, isLoading]);

  // textarea 自动伸缩
  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    // 延迟一帧等待 DOM 更新以计算 scrollHeight
    requestAnimationFrame(autoResizeTextarea);
  }, [autoResizeTextarea]);

  const handleDismiss = useCallback((messageId: string) => {
    setDismissedIds(prev => new Set(prev).add(messageId));
    dismissResponse(messageId);
  }, [dismissResponse]);

  // 发送：若选中预设则先解析模板变量再发送
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText('');
    // 重置 textarea 高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
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
  const handlePresetChange = useCallback((presetId: string) => {
    if (!presetId) {
      handleSelectPreset(null);
      return;
    }
    if (presetId === '__new__') {
      handleSelectPreset(null);
      setShowPresetManager(true);
      return;
    }
    handleSelectPreset(presetId);
    const preset = chatPresets.find(p => p.id === presetId);
    if (preset) {
      setInputText(preset.promptTemplate);
      requestAnimationFrame(autoResizeTextarea);
    }
  }, [chatPresets, handleSelectPreset, autoResizeTextarea]);

  if (!isChatOpen) return null;

  const hasProviders = modelOptions.length > 0;
  const panelContent = (
    <div className="chat-panel" ref={panelRef} style={{ top: panelPos.top, left: panelPos.left }}>
      {/* Header — 极简单行 */}
      <div className="chat-header">
        <span className="chat-header-title">{t('chat.title')}</span>
        {currentBox && (
          <span className="chat-badge">
            {currentBox.desc || currentBox.text || currentBox.id}
          </span>
        )}
        <span className="chat-header-spacer" />
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
          {error && <div className="chat-error">{t('chat.error', { error: error || '' })}</div>}
        </div>
      )}

      {/* Toolbar — 可折叠 */}
      {hasProviders && (
        <div className={`chat-toolbar ${toolbarCollapsed ? 'collapsed' : ''}`}>
          {chatPresets.length > 0 && (
            <SelectMenu
              className="chat-preset-select"
              options={chatPresets.map(p => ({ value: p.id, label: p.name }))}
              value={selectedPreset?.id || ''}
              onChange={handlePresetChange}
              placeholder={t('chat.presets.selectPreset')}
              specialOptions={[{ value: '__new__', label: t('chat.presets.manage') }]}
              onSpecialSelect={(v) => {
                handleSelectPreset(null);
                setShowPresetManager(true);
              }}
            />
          )}

          <SelectMenu
            className="chat-model-select"
            options={modelOptions.map(opt => ({ value: opt.value, label: opt.label }))}
            value={chatModel}
            onChange={handleSelectModel}
            placeholder={t('chat.modelSelect')}
          />

          <SelectMenu
            className="chat-lang-select"
            options={[
              { value: 'auto', label: '🌐 Auto' },
              { value: 'en', label: 'EN' },
              { value: 'zh', label: '中文' },
            ]}
            value={chatResponseLang}
            onChange={setChatResponseLang}
          />

          <span className="chat-header-spacer" />

          <button className="chat-preset-mgr-btn" onClick={() => setShowPresetManager(true)} title={t('chat.presets.manage')}>
            ⚙
          </button>
          <button className="chat-clear-btn" onClick={handleClearHistory} title={t('chat.clearHistory')}>
            🗑
          </button>

          <button
            className="chat-toolbar-toggle"
            onClick={() => setToolbarCollapsed(v => !v)}
            title={toolbarCollapsed ? 'Expand' : 'Collapse'}
          >
            {toolbarCollapsed ? '▼' : '▲'}
          </button>
        </div>
      )}

      {/* Input */}
      {hasProviders && (
        <div className="chat-input-area">
          <textarea
            ref={textareaRef}
            className="chat-input"
            rows={1}
            value={inputText}
            onChange={handleInputChange}
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