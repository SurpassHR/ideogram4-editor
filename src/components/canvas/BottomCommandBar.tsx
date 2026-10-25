import React, { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import {
  IconSparkle,
  IconClose,
  IconImage,
  IconLoading,
  IconMessage,
  IconTrash,
  IconGear,
  IconArrowUp,
  IconStop,
  IconBox,
} from '../ui/icons';
import {
  buildSceneAutoCompletePrompt,
  buildImageInversionPrompt,
  extractAndValidateIdeogramJSON,
} from '../../services/llm-canvas-chat';
import { sendChatMessageStream } from '../../services/llm-stream';
import { getLlmProviders } from '../llm/api';
import { buildIdeogramExtraction } from '../../services/skill-adapters/ideogram4';
import { applyExtractionToStore } from '../../services/skill-apply';
import {
  RATIO_KEYS,
  RATIO_BASES,
  computeCanvasDims,
} from '../../utils/canvas-dims';
import { useCanvasChat } from '../../hooks/useCanvasChat';
import { useAutoGrowTextarea } from '../../hooks/useAutoGrowTextarea';
import type { LlmProvider } from '../llm/types';

export const BottomCommandBar: React.FC = () => {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyPopupRef = useRef<HTMLDivElement>(null);
  const configPopupRef = useRef<HTMLDivElement>(null);

  const {
    boxes,
    canvasW,
    canvasH,
    canvasBackgroundUrl,
    selectedBoxId,
    selectBox,
    setCanvasDimensions,
    chatModel,
    setChatModel,
    chatPresets,
    isGeneratingScene,
    isExtractingImage,
    setIsGeneratingScene,
    setIsExtractingImage,
    snapshot,
    canvasChatSessions,
    activeCanvasChatSessionId,
    selectCanvasChatSession,
    createCanvasChatSession,
    deleteCanvasChatSession,
    clearCanvasChatSession,
  } = useEditorStore();

  const {
    sendMessage,
    stopGeneration,
    modelOptions,
    isLoading: isChatStreaming,
  } = useCanvasChat();

  const registerAutoGrowTextarea = useAutoGrowTextarea(input, 180);
  const selectedBoxIndex = boxes.findIndex((b) => b.id === selectedBoxId);
  const isBusy = isGeneratingScene || isExtractingImage || isChatStreaming;

  const activeSession =
    canvasChatSessions.find((s) => s.id === activeCanvasChatSessionId) ??
    canvasChatSessions[0];
  const totalMessageCount = canvasChatSessions.reduce(
    (acc, s) => acc + s.messages.length,
    0
  );

  // 点击外部关闭历史/配置浮窗
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        historyPopupRef.current &&
        !historyPopupRef.current.contains(target)
      ) {
        setShowHistory(false);
      }
      if (
        configPopupRef.current &&
        !configPopupRef.current.contains(target)
      ) {
        setShowConfig(false);
      }
    };
    if (showHistory || showConfig) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showHistory, showConfig]);

  // 快捷比例匹配
  const standardRatios = RATIO_KEYS.filter((k) => k !== 'custom');
  const matchedRatio =
    standardRatios.find((key) => {
      const base = RATIO_BASES[key];
      return Math.abs(base.baseW / base.baseH - canvasW / canvasH) < 0.05;
    }) || '1:1';

  const handleRatioChange = (ratioVal: any) => {
    const dims = computeCanvasDims(ratioVal, 4, 1, 1);
    setCanvasDimensions(dims.w, dims.h);
  };

  const getActiveModelConfig = async (): Promise<{ provider: LlmProvider; model: string } | null> => {
    const providers = await getLlmProviders();
    if (!chatModel) return null;
    const [providerId, ...rest] = chatModel.split(':');
    const modelName = rest.join(':');
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return null;
    return { provider, model: modelName };
  };

  const handleSubmitOrAutoComplete = async () => {
    if (isBusy) return;
    const text = input.trim();
    if (text) {
      setInput('');
      await sendMessage(text);
    } else {
      await handleAutoCompleteDirect();
    }
  };

  const handleAutoCompleteDirect = async () => {
    if (isBusy) return;
    const modelConfig = await getActiveModelConfig();
    if (!modelConfig) {
      alert('Please configure an LLM model in Settings first.');
      return;
    }

    setIsGeneratingScene(true);
    snapshot();

    try {
      const prompt = buildSceneAutoCompletePrompt(boxes, canvasW, canvasH, input.trim() || undefined);
      let accumulatedText = '';

      await sendChatMessageStream(
        modelConfig.provider,
        modelConfig.model,
        [{ role: 'user', content: prompt }],
        'You are an expert AI composition artist.',
        {
          onChunk: (chunk) => {
            if (chunk.type === 'content') accumulatedText += chunk.text;
          },
          onDone: (fullText) => {
            accumulatedText = fullText;
          },
          onError: (err) => {
            console.error('Scene Auto-Complete failed:', err);
          },
        }
      );

      const parsed = extractAndValidateIdeogramJSON(accumulatedText);
      if (parsed) {
        const extraction = buildIdeogramExtraction(parsed, accumulatedText, { canvasW, canvasH });
        applyExtractionToStore(extraction, useEditorStore.getState());
        setInput('');
      } else {
        console.warn('Could not extract valid Ideogram JSON from response');
      }
    } catch (err) {
      console.error('Error during auto-complete:', err);
    } finally {
      setIsGeneratingScene(false);
    }
  };

  const handleInvertImage = async () => {
    if (isBusy || !canvasBackgroundUrl) return;
    const modelConfig = await getActiveModelConfig();
    if (!modelConfig) {
      alert('Please configure an LLM model in Settings first.');
      return;
    }

    setIsExtractingImage(true);
    snapshot();

    try {
      const prompt = buildImageInversionPrompt(canvasW, canvasH);
      let accumulatedText = '';

      await sendChatMessageStream(
        modelConfig.provider,
        modelConfig.model,
        [
          {
            role: 'user',
            content: prompt,
          },
        ],
        'You are an expert vision and layout analyzer.',
        {
          onChunk: (chunk) => {
            if (chunk.type === 'content') accumulatedText += chunk.text;
          },
          onDone: (fullText) => {
            accumulatedText = fullText;
          },
          onError: (err) => {
            console.error('Image inversion failed:', err);
          },
        },
        canvasBackgroundUrl
      );

      const parsed = extractAndValidateIdeogramJSON(accumulatedText);
      if (parsed) {
        const extraction = buildIdeogramExtraction(parsed, accumulatedText, { canvasW, canvasH });
        applyExtractionToStore(extraction, useEditorStore.getState());
      }
    } catch (err) {
      console.error('Error during image inversion:', err);
    } finally {
      setIsExtractingImage(false);
    }
  };

  const handleApplyPreset = (presetContent: string) => {
    setInput(presetContent);
    setShowConfig(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitOrAutoComplete();
    } else if (e.key === 'Escape') {
      if (selectedBoxId) {
        selectBox(null);
      }
    }
  };

  const currentModelLabel =
    modelOptions.find((m) => m.value === chatModel)?.label ??
    (chatModel ? chatModel.split(':').pop() : 'No Model');

  return (
    <>
      {/* 预设与模型配置浮窗 */}
      {showConfig && (
        <div
          ref={configPopupRef}
          style={{
            position: 'absolute',
            bottom: '100px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '460px',
            maxWidth: '85vw',
            background: 'rgba(20, 20, 20, 0.95)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '16px',
            boxShadow: '0 20px 48px rgba(0, 0, 0, 0.65)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 70,
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              background: '#161616',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#fafafa', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <IconGear size={13} />
              AI Model & Presets
            </span>
            <button
              onClick={() => setShowConfig(false)}
              style={{ background: 'none', border: 'none', color: '#737373', cursor: 'pointer', padding: '2px' }}
            >
              <IconClose size={13} />
            </button>
          </div>
          <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#b3b3b3', marginBottom: '6px' }}>
                Active LLM Model
              </div>
              {modelOptions.length > 0 ? (
                <select
                  value={chatModel}
                  onChange={(e) => setChatModel(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#1c1c1c',
                    color: '#fafafa',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '12px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {modelOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ fontSize: '11px', color: '#737373' }}>
                  No models available. Please add an API key in Settings.
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#b3b3b3', marginBottom: '6px' }}>
                Quick Prompt Presets
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                {chatPresets.length > 0 ? (
                  chatPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyPreset(preset.promptTemplate)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        color: '#fafafa',
                        fontSize: '11px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                      }}
                      title={preset.promptTemplate}
                    >
                      {preset.name}
                    </button>
                  ))
                ) : (
                  <div style={{ fontSize: '11px', color: '#737373' }}>
                    No presets configured. Add templates in Settings.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 完整多会话历史浮窗 */}
      {showHistory && (
        <div
          ref={historyPopupRef}
          style={{
            position: 'absolute',
            bottom: '100px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '680px',
            maxWidth: '88vw',
            height: '420px',
            background: 'rgba(20, 20, 20, 0.95)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '16px',
            boxShadow: '0 20px 48px rgba(0, 0, 0, 0.65)',
            display: 'flex',
            overflow: 'hidden',
            zIndex: 70,
            pointerEvents: 'auto',
          }}
        >
          {/* 左侧：多会话列表 */}
          <div
            style={{
              width: '200px',
              borderRight: '1px solid rgba(255, 255, 255, 0.08)',
              background: '#141414',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#b3b3b3' }}>
                {t('chat.canvasSessions.sectionTitle')}
              </span>
              <button
                type="button"
                onClick={() => createCanvasChatSession()}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  color: '#fafafa',
                  fontSize: '11px',
                  padding: '2px 6px',
                  cursor: 'pointer',
                }}
              >
                +
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
              {canvasChatSessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => selectCanvasChatSession(session.id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    marginBottom: '4px',
                    cursor: 'pointer',
                    background:
                      session.id === activeSession?.id
                        ? 'rgba(255, 255, 255, 0.12)'
                        : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ overflow: 'hidden' }}>
                    <div
                      style={{
                        fontSize: '12px',
                        color: session.id === activeSession?.id ? '#fafafa' : '#888',
                        fontWeight: session.id === activeSession?.id ? 600 : 400,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {session.title || '新会话'}
                    </div>
                    <div style={{ fontSize: '10px', color: '#666' }}>
                      {session.messages.length} msgs
                    </div>
                  </div>
                  {canvasChatSessions.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCanvasChatSession(session.id);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#666',
                        cursor: 'pointer',
                        padding: '2px',
                      }}
                      title="Delete"
                    >
                      <IconTrash size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 右侧：当前会话消息列表 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#181818' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#fafafa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IconSparkle size={13} />
                {activeSession?.title || 'Canvas Chat'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {activeSession && activeSession.messages.length > 0 && (
                  <button
                    onClick={() => clearCanvasChatSession(activeSession.id)}
                    style={{ background: 'none', border: 'none', color: '#737373', fontSize: '11px', cursor: 'pointer' }}
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setShowHistory(false)}
                  style={{ background: 'none', border: 'none', color: '#737373', cursor: 'pointer', padding: '2px' }}
                >
                  <IconClose size={13} />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {!activeSession || activeSession.messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#737373', fontSize: '12px', padding: '36px 0' }}>
                  No messages in this session. Type in the command bar below to chat.
                </div>
              ) : (
                activeSession.messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      padding: '8px 12px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      lineHeight: '1.5',
                      background: msg.role === 'user' ? '#fafafa' : '#242424',
                      color: msg.role === 'user' ? '#111111' : '#fafafa',
                      border: msg.role === 'user' ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    {msg.content}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 常驻指令岛核心：Codex 式多行两层结构 */}
      <div data-testid="bottom-command-bar" className="bottom-command-bar">
        {/* 上层：多行自动撑高输入区域 */}
        <div className="bottom-command-bar-input-row">
          <textarea
            ref={(el) => {
              (inputRef as any).current = el;
              registerAutoGrowTextarea(el);
            }}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isBusy}
            placeholder={
              selectedBoxId
                ? t('commandBar.scopeBox', { idx: selectedBoxIndex + 1 }) + ' selected. Type to instruct...'
                : t('commandBar.placeholder')
            }
            className="bottom-command-bar-input"
          />
        </div>

        {/* 下层：工具栏操作行（左右排列，按钮各司其职） */}
        <div className="bottom-command-bar-footer">
          {/* 左侧控制区：比例 + 选区 */}
          <div className="bottom-command-bar-footer-left">
            <select
              value={matchedRatio}
              onChange={(e) => handleRatioChange(e.target.value)}
              disabled={isBusy}
              aria-label="Aspect Ratio"
              className="cmd-pill-btn"
              style={{ outline: 'none' }}
            >
              {standardRatios.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>

            {selectedBoxId ? (
              <span className="bottom-command-bar-scope-pill is-box">
                <IconBox size={11} />
                <span>{t('commandBar.scopeBox', { idx: selectedBoxIndex + 1 })}</span>
                <button
                  onClick={() => selectBox(null)}
                  title={t('commandBar.clearScope')}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                >
                  <IconClose size={10} />
                </button>
              </span>
            ) : (
              <span className="bottom-command-bar-scope-pill is-global">
                {t('commandBar.scopeGlobal')}
              </span>
            )}
          </div>

          {/* 右侧控制区：模型选择 + 历史 + 读图反推 + 发送按钮 */}
          <div className="bottom-command-bar-footer-right">
            {/* 模型/预设切换器：文本超长时自适应截断 */}
            <button
              type="button"
              onClick={() => {
                setShowConfig(!showConfig);
                setShowHistory(false);
              }}
              className="cmd-pill-btn"
              title={`Active Model: ${currentModelLabel}`}
            >
              <IconGear size={12} />
              <span className="cmd-text-label" style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentModelLabel}
              </span>
            </button>

            {/* 历史消息条数 */}
            <button
              type="button"
              onClick={() => {
                setShowHistory(!showHistory);
                setShowConfig(false);
              }}
              className="cmd-pill-btn"
              title="View Canvas Chat Sessions & History"
            >
              <IconMessage size={12} />
              <span className="cmd-text-label">{totalMessageCount}</span>
            </button>

            {/* 参考背景图反推落框按钮 */}
            {canvasBackgroundUrl && (
              <button
                data-testid="btn-invert-image"
                onClick={handleInvertImage}
                disabled={isBusy}
                className="cmd-pill-btn"
                style={{ color: '#34d399', borderColor: 'rgba(52, 211, 153, 0.25)', background: 'rgba(16, 185, 129, 0.1)' }}
                title={t('commandBar.invertImage')}
              >
                {isExtractingImage ? (
                  <IconLoading size={12} className="spin-icon" />
                ) : (
                  <IconImage size={12} />
                )}
                <span className="cmd-text-label">{t('commandBar.invertImage')}</span>
              </button>
            )}

            {/* Codex 式实心圆形主发送/补全/停止按钮 */}
            {isBusy ? (
              <button
                type="button"
                onClick={stopGeneration}
                title="Stop generating"
                className="cmd-send-circle-btn"
                style={{ background: '#ef4444', color: '#fff' }}
              >
                <IconStop size={14} />
              </button>
            ) : (
              <button
                data-testid="btn-autocomplete-scene"
                type="button"
                onClick={handleSubmitOrAutoComplete}
                title={input.trim() ? 'Send Command (Enter)' : t('commandBar.autoComplete')}
                className="cmd-send-circle-btn"
              >
                {input.trim() ? (
                  <IconArrowUp size={15} />
                ) : (
                  <IconSparkle size={15} />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

