import React, { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import { IconSparkle, IconClose, IconImage, IconLoading, IconMessage } from '../ui/icons';
import { buildSceneAutoCompletePrompt, buildImageInversionPrompt, extractAndValidateIdeogramJSON } from '../../services/llm-canvas-chat';
import { sendChatMessageStream } from '../../services/llm-stream';
import { getLlmProviders } from '../llm/api';
import { buildIdeogramExtraction } from '../../services/skill-adapters/ideogram4';
import { applyExtractionToStore } from '../../services/skill-apply';
import { RATIO_KEYS, RATIO_BASES, computeCanvasDims } from '../../utils/canvas-dims';
import { useCanvasChat } from '../../hooks/useCanvasChat';
import type { LlmProvider } from '../llm/types';

export const BottomCommandBar: React.FC = () => {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyPopupRef = useRef<HTMLDivElement>(null);

  const {
    boxes,
    canvasW,
    canvasH,
    canvasBackgroundUrl,
    selectedBoxId,
    selectBox,
    setCanvasDimensions,
    chatModel,
    isGeneratingScene,
    isExtractingImage,
    setIsGeneratingScene,
    setIsExtractingImage,
    snapshot,
    canvasChatMessages,
  } = useEditorStore();

  const {
    sendMessage,
    isLoading: isChatStreaming,
  } = useCanvasChat();

  const selectedBoxIndex = boxes.findIndex((b) => b.id === selectedBoxId);
  const isBusy = isGeneratingScene || isExtractingImage || isChatStreaming;

  // 点击外部关闭历史弹窗
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        historyPopupRef.current &&
        !historyPopupRef.current.contains(e.target as Node)
      ) {
        setShowHistory(false);
      }
    };
    if (showHistory) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showHistory]);

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

  // 发送指令/对话：如果有输入，走多轮构图 Agent 流程（带历史上下文）；如果输入为空，触发一键场景润色
  const handleSubmitOrAutoComplete = async () => {
    if (isBusy) return;
    const text = input.trim();
    if (text) {
      // 构图对话：调用 Canvas Chat 的多轮消息流，直接在画布上落框/调整
      setInput('');
      await sendMessage(text);
    } else {
      // 一键全场补全（无输入时的快捷心流）
      await handleAutoCompleteDirect();
    }
  };

  // 纯粹的【✨ 补全全场】主按钮行为
  const handleAutoCompleteDirect = async () => {
    if (isBusy) return;
    const modelConfig = await getActiveModelConfig();
    if (!modelConfig) {
      alert('Please configure an LLM model in Settings first.');
      return;
    }

    setIsGeneratingScene(true);
    snapshot(); // 记录撤销点

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

  // 背景参考图反推落框
  const handleInvertImage = async () => {
    if (isBusy || !canvasBackgroundUrl) return;
    const modelConfig = await getActiveModelConfig();
    if (!modelConfig) {
      alert('Please configure an LLM model in Settings first.');
      return;
    }

    setIsExtractingImage(true);
    snapshot(); // 记录撤销点

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitOrAutoComplete();
    } else if (e.key === 'Escape') {
      if (selectedBoxId) {
        selectBox(null);
      }
    }
  };

  return (
    <>
      {/* 历史对话悬浮弹出浮窗 */}
      {showHistory && (
        <div
          ref={historyPopupRef}
          style={{
            position: 'absolute',
            bottom: '76px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '580px',
            maxWidth: '85vw',
            maxHeight: '380px',
            background: 'rgba(20, 20, 20, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '16px',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6)',
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
              padding: '8px 14px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              background: '#161616',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#fafafa', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <IconSparkle size={13} />
              Canvas AI Log & Context ({canvasChatMessages.length})
            </span>
            <button
              onClick={() => setShowHistory(false)}
              style={{ background: 'none', border: 'none', color: '#737373', cursor: 'pointer', padding: '2px' }}
            >
              <IconClose size={13} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {canvasChatMessages.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#737373', fontSize: '12px', padding: '24px 0' }}>
                No conversation history yet. Type a command in the bar below.
              </div>
            ) : (
              canvasChatMessages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    lineHeight: '1.5',
                    background: msg.role === 'user' ? '#fafafa' : '#222222',
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
      )}

      {/* 常驻指令岛核心 */}
      <div data-testid="bottom-command-bar" className="bottom-command-bar">
        {/* 比例选择器 */}
        <div>
          <select
            value={matchedRatio}
            onChange={(e) => handleRatioChange(e.target.value)}
            disabled={isBusy}
            aria-label="Aspect Ratio"
          >
            {standardRatios.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>

        {/* 焦点范围胶囊指示 */}
        <div>
          {selectedBoxId ? (
            <span className="bottom-command-bar-scope-pill is-box">
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

        {/* 中央直达输入框 */}
        <div className="bottom-command-bar-input-wrap">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isBusy}
            placeholder={
              input
                ? 'Press Enter to command the canvas...'
                : t('commandBar.placeholder')
            }
            className="bottom-command-bar-input"
          />
        </div>

        {/* 历史对话展开开关按钮 */}
        {canvasChatMessages.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            title="View AI Chat History"
            style={{
              background: showHistory ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '9999px',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: '#fafafa',
              fontSize: '11px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <IconMessage size={12} />
            <span>{canvasChatMessages.length}</span>
          </button>
        )}

        {/* 核心动作触发区 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* 背景图提取按钮 */}
          {canvasBackgroundUrl && (
            <button
              data-testid="btn-invert-image"
              onClick={handleInvertImage}
              disabled={isBusy}
              title={t('commandBar.invertImage')}
              className="bottom-command-bar-btn-invert"
            >
              {isExtractingImage ? (
                <>
                  <IconLoading size={12} className="spin-icon" />
                  <span>{t('commandBar.invertImageLoading')}</span>
                </>
              ) : (
                <>
                  <IconImage size={12} />
                  <span>{t('commandBar.invertImage')}</span>
                </>
              )}
            </button>
          )}

          {/* 构图速写一键补全主按钮 */}
          <button
            data-testid="btn-autocomplete-scene"
            onClick={handleSubmitOrAutoComplete}
            disabled={isBusy}
            title={input.trim() ? 'Send instruction' : t('commandBar.autoComplete')}
            className="bottom-command-bar-btn-auto"
          >
            {isGeneratingScene || isChatStreaming ? (
              <>
                <IconLoading size={13} className="spin-icon" />
                <span>{input.trim() ? 'Composing...' : t('commandBar.autoCompleteLoading')}</span>
              </>
            ) : (
              <>
                <IconSparkle size={13} />
                <span>{input.trim() ? 'Send Command' : t('commandBar.autoComplete')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
};

