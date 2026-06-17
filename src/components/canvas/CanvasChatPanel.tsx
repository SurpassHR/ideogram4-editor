/**
 * Canvas AI Chat Panel — 画布级 AI 构图对话面板
 *
 * 可折叠对话面板，位于 Artboard 内部底部，不随缩放/平移变化。
 * 用户输入主题意象，AI 返回 IdeogramOutput JSON，用户选择性 Apply 到画布。
 *
 * 组件路径：src/components/canvas/CanvasChatPanel.tsx
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import ChatMessage from '../chat/ChatMessage';
import type { ChatMessage as ChatMessageType } from '../../types/chat';
import type { IdeogramOutput } from '../../types';

// ─── Apply 选择弹窗 ────────────────────────────────────────────────

export interface ApplySelections {
  boxes: boolean;
  globalDesc: boolean;
  styleParams: boolean;
  globalPalette: boolean;
}

interface ApplyConfirmDialogProps {
  output: IdeogramOutput;
  onApply: (selections: ApplySelections) => void;
  onCancel: () => void;
}

function ApplyConfirmDialog({ output, onApply, onCancel }: ApplyConfirmDialogProps) {
  const [selections, setSelections] = useState<ApplySelections>({
    boxes: true,
    globalDesc: true,
    styleParams: true,
    globalPalette: true,
  });

  const toggle = (key: keyof ApplySelections) => {
    setSelections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const elementCount = output.compositional_deconstruction?.elements?.length ?? 0;
  const paletteCount = output.style_description?.color_palette?.length ?? 0;

  return (
    <div className="canvas-chat-overlay" onClick={onCancel}>
      <div className="canvas-chat-apply-dialog" onClick={e => e.stopPropagation()}>
        <div className="canvas-chat-apply-title">Apply Composition</div>

        <label className="canvas-chat-apply-item">
          <input
            type="checkbox"
            checked={selections.boxes}
            onChange={() => toggle('boxes')}
          />
          <span>Boxes ({elementCount} elements + descriptions + colors)</span>
        </label>

        <label className="canvas-chat-apply-item">
          <input
            type="checkbox"
            checked={selections.globalDesc}
            onChange={() => toggle('globalDesc')}
          />
          <span>Global Description</span>
        </label>

        <label className="canvas-chat-apply-item">
          <input
            type="checkbox"
            checked={selections.styleParams}
            onChange={() => toggle('styleParams')}
          />
          <span>Style Parameters (aesthetics / lighting / medium / art_style / background)</span>
        </label>

        <label className="canvas-chat-apply-item">
          <input
            type="checkbox"
            checked={selections.globalPalette}
            onChange={() => toggle('globalPalette')}
          />
          <span>Global Palette ({paletteCount} colors)</span>
        </label>

        <div className="canvas-chat-apply-actions">
          <button className="canvas-chat-apply-cancel-btn" onClick={onCancel}>Cancel</button>
          <button
            className="canvas-chat-apply-confirm-btn"
            onClick={() => onApply(selections)}
          >
            Apply Selected
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CanvasChatPanel ────────────────────────────────────────────────

interface CanvasChatPanelProps {
  onSend: (text: string) => void;
  onApply: (selections: ApplySelections) => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function CanvasChatPanel({ onSend, onApply, isLoading = false, error = null }: CanvasChatPanelProps) {
  const isCanvasChatOpen = useEditorStore(s => s.isCanvasChatOpen);
  const setCanvasChatOpen = useEditorStore(s => s.setCanvasChatOpen);
  const canvasChatMessages = useEditorStore(s => s.canvasChatMessages);
  const pendingIdeogramOutput = useEditorStore(s => s.pendingIdeogramOutput);
  const { t } = useI18n();

  const [inputText, setInputText] = useState('');
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 新消息自动滚动
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
      el.scrollTop = el.scrollHeight;
    }
  }, [canvasChatMessages.length, isLoading]);

  // 发送消息
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    onSend(text);
  }, [inputText, isLoading, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`;
  }, []);

  const handleApplyClick = useCallback(() => {
    setShowApplyDialog(true);
  }, []);

  const handleApplyConfirm = useCallback((selections: ApplySelections) => {
    setShowApplyDialog(false);
    onApply(selections);
  }, [onApply]);

  const handleApplyCancel = useCallback(() => {
    setShowApplyDialog(false);
  }, []);

  return (
    <div className="canvas-chat-container">
      {/* 折叠态触发条 */}
      {!isCanvasChatOpen && (
        <button
          className="canvas-chat-toggle"
          onClick={() => setCanvasChatOpen(true)}
          data-testid="canvas-chat-toggle"
        >
          <span>🤖 AI Compose</span>
          <span className="canvas-chat-toggle-hint">
            — Describe a theme, let AI design the composition
          </span>
        </button>
      )}

      {/* 展开态 */}
      {isCanvasChatOpen && (
        <div className="canvas-chat-expanded" data-testid="canvas-chat-expanded">
          {/* 消息列表 */}
          <div className="canvas-chat-messages" ref={messagesRef}>
            {canvasChatMessages.length === 0 && !isLoading && (
              <div className="canvas-chat-empty-hint">
                Describe a theme or scene, and AI will design the composition for you.
              </div>
            )}
            {canvasChatMessages.map(msg => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isLoading && (
              <div className="chat-loading">{t('chat.loading')}</div>
            )}
            {error && (
              <div className="chat-error">{t('chat.error', { error: error || '' })}</div>
            )}
          </div>

          {/* 底部栏：Apply 按钮 + 输入区 + 折叠按钮 */}
          <div className="canvas-chat-bottom">
            {/* Apply 按钮 — 仅当有 pendingIdeogramOutput 时显示 */}
            {pendingIdeogramOutput && (
              <button
                className="canvas-chat-apply-btn"
                onClick={handleApplyClick}
                data-testid="canvas-chat-apply-btn"
              >
                ✅ Apply Composition
              </button>
            )}

            {/* 输入区 */}
            <div className="canvas-chat-input-area">
              <textarea
                ref={textareaRef}
                className="canvas-chat-input"
                rows={1}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Describe a theme or scene..."
                disabled={isLoading}
              />
              <button
                className="canvas-chat-send-btn"
                onClick={handleSend}
                disabled={isLoading || !inputText.trim()}
                data-testid="canvas-chat-send-btn"
                title="Send"
              >
                ➤
              </button>
              <button
                className="canvas-chat-collapse-btn"
                onClick={() => setCanvasChatOpen(false)}
                data-testid="canvas-chat-collapse-btn"
                title="Collapse"
              >
                ▼
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apply 确认弹窗 */}
      {showApplyDialog && pendingIdeogramOutput && (
        <ApplyConfirmDialog
          output={pendingIdeogramOutput}
          onApply={handleApplyConfirm}
          onCancel={handleApplyCancel}
        />
      )}
    </div>
  );
}
