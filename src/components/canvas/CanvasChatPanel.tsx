import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useCanvasChat, type ApplySelections } from '../../hooks/useCanvasChat';
import ChatMessage from '../chat/ChatMessage';
import SelectMenu from '../chat/SelectMenu';
import { useI18n } from '../../i18n/context';
import { useEditorStore } from '../../store';
import { resolveTemplate } from '../../utils/resolveTemplate';

export default function CanvasChatPanel() {
  const {
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
    handleSelectModel,
    setChatResponseLang,
    hasProviders,
    chatPresets,
    selectedPreset,
    selectedBox,
    handleSelectPreset,
  } = useCanvasChat();

  const isCanvasChatOpen = useEditorStore(s => s.isCanvasChatOpen);
  const setCanvasChatOpen = useEditorStore(s => s.setCanvasChatOpen);

  const { t } = useI18n();
  const [inputText, setInputText] = useState('');
  const [applyToast, setApplyToast] = useState<string | null>(null);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 点击画布空白区关闭面板
  useEffect(() => {
    if (!isCanvasChatOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setCanvasChatOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isCanvasChatOpen, setCanvasChatOpen]);

  // Escape 关闭面板
  useEffect(() => {
    if (!isCanvasChatOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCanvasChatOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isCanvasChatOpen, setCanvasChatOpen]);

  const handleToggle = useCallback(() => {
    setCanvasChatOpen(!isCanvasChatOpen);
  }, [isCanvasChatOpen, setCanvasChatOpen]);

  const handleAddProvider = useCallback(() => {
    window.location.hash = '#/settings';
  }, []);

  // 新消息自动滚到底部
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, isLoading]);
  // 阻止 wheel 事件冒泡到 Artboard（避免缩放 canvas 而非滚动消息列表）
  // 边界时 preventDefault 防止页面滚动链
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight;
      const scrollingDown = e.deltaY > 0;
      const scrollingUp = e.deltaY < 0;

      // 能继续滚动 → 停止冒泡（阻止画布缩放）但允许默认滚动
      if ((scrollingDown && !atBottom) || (scrollingUp && !atTop)) {
        e.stopPropagation();
        return;
      }

      // 到达边界或无滚动内容 → 同时阻止默认行为（页面滚动链）和冒泡（画布缩放）
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [isCanvasChatOpen]);

  // Apply 成功 toast
  useEffect(() => {
    if (applyToast) {
      const timer = setTimeout(() => {
        setApplyToast(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [applyToast]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
  }, []);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText('');
    // 选中预设且当前有选中 box 时解析模板变量
    const resolvedText = selectedPreset && selectedBox
      ? resolveTemplate(text, selectedBox)
      : text;
    sendMessage(resolvedText);
    handleSelectPreset(null); // 发送后清除预设选择
  }, [inputText, isLoading, sendMessage, selectedPreset, selectedBox, handleSelectPreset]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  /** 选中预设：将模板文本填入输入框 */
  const handlePresetChange = useCallback((presetId: string) => {
    if (!presetId) {
      handleSelectPreset(null);
      return;
    }
    handleSelectPreset(presetId);
    const preset = chatPresets.find(p => p.id === presetId);
    if (preset) {
      setInputText(preset.promptTemplate);
    }
  }, [chatPresets, handleSelectPreset]);

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

  // ─── 始终渲染：底部横杠可点击 toggle + JS 状态驱动面板 ──────
  return (
    <>
      <div
        ref={wrapperRef}
        className={`canvas-chat-handle-wrapper${isCanvasChatOpen ? ' open' : ''}`}
      >
        <div className="canvas-chat-panel">
          {/* Header */}
          <div className="canvas-chat-header">
            <span className="canvas-chat-header-title">🤖 Canvas AI Compose</span>
            <span className="chat-header-spacer" />
          </div>

          {/* 无 LLM 配置提示 */}
          {!hasProviders && (
            <div className="chat-no-provider">
              <p>{t('chat.noProvider')}</p>
              <button
                className="btn"
                onClick={handleAddProvider}
                style={{ fontSize: 12, padding: '5px 14px' }}
              >
                {t('llmConfig.addProvider')}
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
                {chatPresets.length > 0 && (
                  <SelectMenu
                    className="chat-preset-select"
                    options={chatPresets.map(p => ({ value: p.id, label: p.name }))}
                    value={selectedPreset?.id || ''}
                    onChange={handlePresetChange}
                    placeholder={t('chat.presets.selectPreset')}
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
        <div className="canvas-chat-handle" onClick={handleToggle} title="Toggle Canvas AI Compose" />
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
