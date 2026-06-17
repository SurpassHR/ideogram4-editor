import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useCanvasChat, type ApplySelections } from '../../hooks/useCanvasChat';
import { useEditorStore } from '../../store';
import ChatMessage from '../chat/ChatMessage';
import SelectMenu from '../chat/SelectMenu';
import { useI18n } from '../../i18n/context';

export default function CanvasChatPanel() {
  const {
    isCanvasChatOpen,
    messages,
    pendingIdeogramOutput,
    isLoading,
    modelOptions,
    chatModel,
    chatResponseLang,
    sendMessage,
    applyOutput,
    applySelections,
    setApplySelections,
    handleClose,
    handleSelectModel,
    setChatResponseLang,
    hasProviders,
  } = useCanvasChat();
  const setCanvasChatOpen = useEditorStore(s => s.setCanvasChatOpen);

  const { t } = useI18n();
  const [inputText, setInputText] = useState('');
  const [applyToast, setApplyToast] = useState<string | null>(null);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  // 新消息自动滚到底部
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, isLoading]);

  // Apply 成功 toast
  useEffect(() => {
    if (applyToast) {
      const timer = setTimeout(() => {
        setApplyToast(null);
        handleClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [applyToast, handleClose]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
  }, []);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText('');
    sendMessage(text);
  }, [inputText, isLoading, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleApply = useCallback(() => {
    setShowApplyConfirm(true);
  }, []);

  const handleApplyConfirm = useCallback(() => {
    const count = applyOutput(applySelections);
    setShowApplyConfirm(false);
    setApplyToast(`Applied ${count} boxes`);
  }, [applyOutput, applySelections]);

  const handleApplyCancel = useCallback(() => {
    setShowApplyConfirm(false);
  }, []);

  /** 切换单个 checkbox */
  const toggleSelection = useCallback((key: keyof ApplySelections) => {
    setApplySelections(prev => ({ ...prev, [key]: !prev[key] }));
  }, [setApplySelections]);

  // ─── 折叠态 ────────────────────────────────────────────────────
  if (!isCanvasChatOpen) {
    return (
      <button className="canvas-chat-trigger" onClick={() => setCanvasChatOpen(true)}>
        🤖 AI Compose — 输入主题意象，让 AI 帮你构图
      </button>
    );
  }

  // ─── 展开态 ────────────────────────────────────────────────────
  return (
    <>
      <div className="canvas-chat-panel">
        {/* Header */}
        <div className="canvas-chat-header">
          <span className="canvas-chat-header-title">🤖 Canvas AI Compose</span>
          <span className="chat-header-spacer" />
          <button className="chat-close-btn" onClick={handleClose} title="Collapse">✕</button>
        </div>

        {/* 无 LLM 配置提示 */}
        {!hasProviders && (
          <div className="chat-no-provider">
            <p>{t('chat.noProvider')}</p>
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
                dismissed={false}
              />
            ))}
            {isLoading && (
              <div className="chat-loading">
                <span className="canvas-chat-spinner" />
                {' '}{t('chat.loading')}
              </div>
            )}
          </div>
        )}

        {/* Input Area */}
        {hasProviders && (
          <div className="canvas-chat-input-area">
            <div className="canvas-chat-toolbar">
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
            </div>
            <div className="canvas-chat-input-row">
              <textarea
                ref={textareaRef}
                className="chat-input"
                rows={2}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Describe the scene you want to compose..."
                disabled={isLoading}
              />
              <div className="canvas-chat-input-actions">
                <button
                  className="chat-send-btn"
                  onClick={handleSend}
                  disabled={isLoading || !inputText.trim()}
                  title={t('chat.send')}
                >
                  {isLoading ? (
                    <span className="canvas-chat-spinner" />
                  ) : '➤'}
                </button>
                {pendingIdeogramOutput !== null && (
                  <button
                    className="canvas-chat-apply-btn"
                    onClick={handleApply}
                    disabled={isLoading}
                  >
                    Apply
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Apply 成功 Toast */}
        {applyToast && (
          <div className="canvas-chat-toast">{applyToast}</div>
        )}
      </div>

      {/* Apply 确认弹窗 (createPortal → body) */}
      {showApplyConfirm && createPortal(
        <div className="modal-overlay" onClick={handleApplyCancel}>
          <div className="canvas-chat-confirm" onClick={e => e.stopPropagation()}>
            <h3>Apply Composition</h3>
            <p className="canvas-chat-confirm-desc">
              Select which parts to apply from the AI composition:
            </p>

            <div className="canvas-chat-confirm-list">
              <label className="canvas-chat-confirm-item">
                <input
                  type="checkbox"
                  checked={applySelections.boxes}
                  onChange={() => toggleSelection('boxes')}
                />
                <span>
                  Boxes ({pendingIdeogramOutput?.compositional_deconstruction.elements.length ?? 0} 个边界框 + 描述 + 颜色)
                </span>
              </label>

              <label className="canvas-chat-confirm-item">
                <input
                  type="checkbox"
                  checked={applySelections.globalDesc}
                  onChange={() => toggleSelection('globalDesc')}
                />
                <span>
                  全局描述 (high_level_description)
                </span>
              </label>

              <label className="canvas-chat-confirm-item">
                <input
                  type="checkbox"
                  checked={applySelections.styleParams}
                  onChange={() => toggleSelection('styleParams')}
                />
                <span>
                  风格参数 (aesthetics / lighting / medium / art_style / background)
                </span>
              </label>

              <label className="canvas-chat-confirm-item">
                <input
                  type="checkbox"
                  checked={applySelections.globalPalette}
                  onChange={() => toggleSelection('globalPalette')}
                />
                <span>
                  全局调色板 ({pendingIdeogramOutput?.style_description.color_palette?.length ?? 0} 色)
                </span>
              </label>

              <label className="canvas-chat-confirm-item">
                <input
                  type="checkbox"
                  checked={applySelections.modeSwitch}
                  onChange={() => toggleSelection('modeSwitch')}
                />
                <span>
                  模式切换 (Art Style / Photo)
                </span>
              </label>
            </div>

            <div className="canvas-chat-confirm-actions">
              <button className="btn" onClick={handleApplyCancel}>Cancel</button>
              <button className="btn canvas-chat-apply-btn" onClick={handleApplyConfirm}>
                Apply Selected
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}