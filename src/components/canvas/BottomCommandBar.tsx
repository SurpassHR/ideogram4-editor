import React, { useState, useRef } from 'react';
import { useEditorStore } from '../../store';
import { useI18n } from '../../i18n/context';
import { IconSparkle, IconClose, IconImage, IconLoading } from '../ui/icons';
import { buildSceneAutoCompletePrompt, buildImageInversionPrompt, extractAndValidateIdeogramJSON } from '../../services/llm-canvas-chat';
import { sendChatMessageStream } from '../../services/llm-stream';
import { getLlmProviders } from '../llm/api';
import { buildIdeogramExtraction } from '../../services/skill-adapters/ideogram4';
import { applyExtractionToStore } from '../../services/skill-apply';
import { RATIO_KEYS, RATIO_BASES, computeCanvasDims } from '../../utils/canvas-dims';
import type { LlmProvider } from '../llm/types';

export const BottomCommandBar: React.FC = () => {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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
  } = useEditorStore();

  const selectedBoxIndex = boxes.findIndex((b) => b.id === selectedBoxId);
  const isBusy = isGeneratingScene || isExtractingImage;

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

  // 一键全场景自动补全
  const handleAutoComplete = async () => {
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
      handleAutoComplete();
    } else if (e.key === 'Escape') {
      if (selectedBoxId) {
        selectBox(null);
      }
    }
  };

  return (
    <div
      data-testid="bottom-command-bar"
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full shadow-2xl transition-all"
      style={{
        background: 'rgba(20, 20, 20, 0.88)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        minWidth: '540px',
        maxWidth: '800px',
        width: '70vw',
      }}
    >
      {/* 比例选择器 */}
      <div className="flex items-center">
        <select
          value={matchedRatio}
          onChange={(e) => handleRatioChange(e.target.value)}
          disabled={isBusy}
          aria-label="Aspect Ratio"
          className="bg-transparent text-xs text-neutral-400 hover:text-white border border-white/10 rounded-full px-2 py-1 outline-none cursor-pointer transition-colors"
          style={{ background: '#1c1c1c' }}
        >
          {standardRatios.map((key) => (
            <option key={key} value={key} className="bg-[#1c1c1c] text-white">
              {key}
            </option>
          ))}
        </select>
      </div>

      {/* 焦点范围胶囊指示 */}
      <div className="flex items-center">
        {selectedBoxId ? (
          <span
            className="flex items-center gap-1 text-[11px] font-medium text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30"
            style={{ background: 'rgba(168, 85, 247, 0.12)' }}
          >
            <span>{t('commandBar.scopeBox', { idx: selectedBoxIndex + 1 })}</span>
            <button
              onClick={() => selectBox(null)}
              title={t('commandBar.clearScope')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              <IconClose size={10} />
            </button>
          </span>
        ) : (
          <span
            className="text-[11px] font-medium text-neutral-400 px-2 py-0.5 rounded-full border border-white/5"
            style={{ background: 'rgba(255, 255, 255, 0.05)' }}
          >
            {t('commandBar.scopeGlobal')}
          </span>
        )}
      </div>

      {/* 中央直达输入框 */}
      <div className="flex-1 flex items-center mx-1">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isBusy}
          placeholder={t('commandBar.placeholder')}
          className="w-full bg-transparent text-xs text-white placeholder:text-neutral-500 outline-none px-1"
        />
      </div>

      {/* 核心动作触发区 */}
      <div className="flex items-center gap-1.5">
        {/* 背景图提取按钮 */}
        {canvasBackgroundUrl && (
          <button
            data-testid="btn-invert-image"
            onClick={handleInvertImage}
            disabled={isBusy}
            title={t('commandBar.invertImage')}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 rounded-full border border-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer disabled:opacity-50"
            style={{ background: 'rgba(16, 185, 129, 0.08)' }}
          >
            {isExtractingImage ? (
              <>
                <IconLoading size={12} className="animate-spin" />
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
          onClick={handleAutoComplete}
          disabled={isBusy}
          title={t('commandBar.autoComplete')}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white rounded-full transition-all cursor-pointer shadow-lg disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, #7c5cfc 0%, #6342e8 100%)',
          }}
        >
          {isGeneratingScene ? (
            <>
              <IconLoading size={13} className="animate-spin" />
              <span>{t('commandBar.autoCompleteLoading')}</span>
            </>
          ) : (
            <>
              <IconSparkle size={13} />
              <span>{t('commandBar.autoComplete')}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

