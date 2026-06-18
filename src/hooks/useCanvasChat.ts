import { useState, useCallback, useEffect, useMemo } from 'react';
import { useEditorStore } from '../store';
import { getLlmProviders } from '../components/llm/api';
import { sendChatMessageStream } from '../services/llm-stream';
import { CANVAS_CHAT_SYSTEM_PROMPT, buildCanvasChatContext, buildLayoutFeedbackPrompt, extractAndValidateIdeogramJSON } from '../services/llm-canvas-chat';
import { validateLayout } from '../services/layout-validator';
import { generateMessageId, createUserMessage, createAssistantMessage } from '../types/chat';
import type { LlmProvider } from '../components/llm/types';
import type { ChatMessage } from '../types/chat';
import type { IdeogramOutput } from '../types';
import { MODE_PHOTO, MODE_ARTSTYLE } from '../types';
import { detectBboxSystem, bboxToPixels } from '../utils/coordinates';

/** Apply 确认弹窗中各部分的选中状态 */
export interface ApplySelections {
  boxes: boolean;
  globalDesc: boolean;
  styleParams: boolean;
  globalPalette: boolean;
  modeSwitch: boolean;
}
/** 截取当前画布的缩略图 Data URL */
async function takeCanvasSnapshot(): Promise<string | undefined> {
  const wrapper = document.querySelector('#canvas-wrapper') as HTMLElement;
  if (!wrapper) return undefined;

  const rect = wrapper.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return undefined;

  const TARGET_W = 120;
  const scale = TARGET_W / rect.width;

  // 使用 foreignObject 将 DOM 序列化到 SVG 再绘制到 canvas
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">
          ${wrapper.outerHTML}
        </div>
      </foreignObject>
    </svg>
  `;

  const canvas = document.createElement('canvas');
  canvas.width = TARGET_W;
  canvas.height = Math.round(rect.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve(undefined);
    img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
  });
}

export function useCanvasChat() {
  const isCanvasChatOpen = useEditorStore(s => s.isCanvasChatOpen);
  const canvasChatMessages = useEditorStore(s => s.canvasChatMessages);
  const pendingIdeogramOutput = useEditorStore(s => s.pendingIdeogramOutput);
  const setCanvasChatOpen = useEditorStore(s => s.setCanvasChatOpen);
  const addCanvasChatMessage = useEditorStore(s => s.addCanvasChatMessage);
  const setPendingIdeogramOutput = useEditorStore(s => s.setPendingIdeogramOutput);
  const setPendingQualityReport = useEditorStore(s => s.setPendingQualityReport);
  const clearCanvasChat = useEditorStore(s => s.clearCanvasChat);
  const chatModel = useEditorStore(s => s.chatModel);
  const chatResponseLang = useEditorStore(s => s.chatResponseLang);
  const setChatModel = useEditorStore(s => s.setChatModel);
  const setChatResponseLang = useEditorStore(s => s.setChatResponseLang);
  const pendingQualityReport = useEditorStore(s => s.pendingQualityReport);

  // 画布状态（用于上下文构建）
  const boxes = useEditorStore(s => s.boxes);
  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const globalPalette = useEditorStore(s => s.globalPalette);
  const highLevelDescription = useEditorStore(s => s.highLevelDescription);
  const aesthetics = useEditorStore(s => s.aesthetics);
  const lighting = useEditorStore(s => s.lighting);
  const medium = useEditorStore(s => s.medium);
  const artStyle = useEditorStore(s => s.artStyle);
  const background = useEditorStore(s => s.background);
  const photoArtStyleMode = useEditorStore(s => s.photoArtStyleMode);

  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const isLoading = useEditorStore(s => s.isCanvasChatLoading);
  const setIsLoading = useEditorStore(s => s.setCanvasChatLoading);

  // 加载提供商列表
  useEffect(() => {
    getLlmProviders().then(setProviders);
  }, []);

  const messages = canvasChatMessages;

  /** 解析模型字符串 "providerId:modelName" */
  const parseModel = useCallback((modelStr: string): { providerId: string; modelName: string } | null => {
    const idx = modelStr.indexOf(':');
    if (idx < 0) return null;
    return { providerId: modelStr.slice(0, idx), modelName: modelStr.slice(idx + 1) };
  }, []);

  /** 获取当前 provider */
  const getCurrentProvider = useCallback((): LlmProvider | null => {
    const parsed = parseModel(chatModel);
    if (!parsed) return null;
    return providers.find(p => p.id === parsed.providerId) || null;
  }, [chatModel, providers, parseModel]);

  /** 构建解析失败的错误文本，用于硬重试时反馈给 LLM */
  function buildParseErrorText(aiText: string): string {
    const match = aiText.match(/```json\s*([\s\S]*?)```/);
    if (!match) {
      return '\n\n[Parse Error]\nNo ```json code block was found in your response. Please return ONLY a valid ```json code block containing your complete composition.';
    }
    const jsonStr = match[1].trim();
    try {
      const p = JSON.parse(jsonStr);
      const cd = (p as Record<string, unknown>).compositional_deconstruction;
      if (!cd || typeof cd !== 'object') {
        return '\n\n[Parse Error]\nMissing or invalid "compositional_deconstruction" field in your JSON.';
      }
      const els = (cd as Record<string, unknown>).elements;
      if (!Array.isArray(els)) {
        return `\n\n[Parse Error]\n"elements" is not an array (type: ${typeof els}). Please provide a valid elements array.`;
      }
      if (els.length === 0) {
        return '\n\n[Parse Error]\nThe elements array is empty. Please include at least one element.';
      }
      for (let i = 0; i < els.length; i++) {
        const el = els[i] as Record<string, unknown>;
        if (typeof el !== 'object' || el === null) {
          return `\n\n[Parse Error]\nelements[${i}] is not an object.`;
        }
        if (el.type !== 'obj' && el.type !== 'text') {
          return `\n\n[Parse Error]\nelements[${i}].type must be "obj" or "text", got "${el.type}".`;
        }
        const bbox = el.bbox;
        if (!Array.isArray(bbox) || bbox.length !== 4) {
          return `\n\n[Parse Error]\nelements[${i}].bbox must be an array of 4 numbers.`;
        }
        const badVals = (bbox as number[]).filter(v => typeof v !== 'number' || isNaN(v) || v < 0);
        if (badVals.length > 0) {
          return `\n\n[Parse Error]\nelements[${i}].bbox contains invalid values: ${JSON.stringify(badVals)}. All values must be non-negative numbers.`;
        }
        if (typeof el.desc !== 'string' || (el.desc as string).trim().length === 0) {
          return `\n\n[Parse Error]\nelements[${i}].desc must be a non-empty string.`;
        }
      }
      return '\n\n[Parse Error]\nAll elements pass basic validation but the JSON was rejected (unknown reason). Please ensure your response contains only a single ```json code block.';
    } catch (e) {
      return `\n\n[Parse Error]\nJSON parsing failed: ${(e as Error).message || String(e)}. Please return a valid \`\`\`json code block.`;
    }
  }

  const sendMessage = useCallback(async (content: string, retryContext?: { feedback?: string }) => {
    const userMessage = createUserMessage(content);
    const snapshotUrl = await takeCanvasSnapshot();
    userMessage.canvasSnapshotUrl = snapshotUrl;
    addCanvasChatMessage(userMessage);
    setIsLoading(true);

    const provider = getCurrentProvider();
    if (!provider) {
      addCanvasChatMessage(createAssistantMessage('No LLM provider selected.'));
      setIsLoading(false);
      return;
    }

    const parsed = parseModel(chatModel);
    if (!parsed) {
      addCanvasChatMessage(createAssistantMessage('No model selected.'));
      setIsLoading(false);
      return;
    }

    // 构造上下文（在循环外快照一次，避免循环内依赖变化）
    const snapshot = {
      boxes: boxes.map(b => ({
        x: b.x, y: b.y, w: b.w, h: b.h,
        mode: b.mode,
        text: b.text,
        desc: b.desc,
        colors: b.colors,
        imageDataUrl: b.imageDataUrl,
        imageRole: b.imageRole,
      })),
      canvasW,
      canvasH,
      globalPalette,
      highLevelDescription,
      aesthetics,
      lighting,
      medium,
      artStyle,
      background,
      photoArtStyleMode,
    };

    // 语言偏好 append 到 system prompt
    let langHint = '';
    if (chatResponseLang === 'en') {
      langHint = '\nYou MUST respond in English.';
    } else if (chatResponseLang === 'zh') {
      langHint = '\n你必须用中文回复。';
    }

    let hardRetryCount = 0;
    const MAX_HARD_RETRIES = 2;
    let lastErrorText = '';

    const doStreamAttempt = (): Promise<boolean> => {
      return new Promise((resolve) => {
        const placeholderId = generateMessageId();
        const placeholder: ChatMessage = {
          id: placeholderId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          canvasSnapshotUrl: snapshotUrl,
        };
        addCanvasChatMessage(placeholder);

        const contextJson = buildCanvasChatContext(snapshot);
        const allMessages = [...canvasChatMessages, userMessage];
        const apiMessages = allMessages.map(m => ({ role: m.role, content: m.content }));
        const lastUserIdx = apiMessages.map((m, i) => (m.role === 'user' ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
        if (lastUserIdx >= 0) {
          let enriched = `Current canvas state (JSON prompt):\n\`\`\`json\n${contextJson}\n\`\`\`\n\nMy composition request: ${apiMessages[lastUserIdx].content}`;
          if (hardRetryCount === 0 && retryContext?.feedback) enriched += buildLayoutFeedbackPrompt(retryContext.feedback);
          if (hardRetryCount > 0 && lastErrorText) enriched += lastErrorText;
          apiMessages[lastUserIdx] = { role: 'user', content: enriched };
        }

        const accumulatedContent: string[] = [];
        const accumulatedThinking: string[] = [];

        sendChatMessageStream(provider, parsed.modelName, apiMessages, CANVAS_CHAT_SYSTEM_PROMPT + langHint, {
          onChunk: ({ type, text }) => {
            if (type === 'thinking') {
              accumulatedThinking.push(text);
            } else {
              accumulatedContent.push(text);
            }
            // 逐步更新 store 中的占位消息
            const store = useEditorStore.getState();
            store.updateCanvasChatMessage(placeholderId, {
              content: accumulatedContent.join(''),
              thinking: accumulatedThinking.join(''),
            });
          },
          onDone: async (fullText) => {
            // 确保最终内容写入
            const finalContent = accumulatedContent.join('') || fullText;
            const finalThinking = accumulatedThinking.join('');
            useEditorStore.getState().updateCanvasChatMessage(placeholderId, {
              content: finalContent,
              thinking: finalThinking || undefined,
            });

            const parsedJson = extractAndValidateIdeogramJSON(finalContent);
            if (parsedJson !== null) {
              setPendingIdeogramOutput(parsedJson);
              // 软校验
              const rawElements = parsedJson.compositional_deconstruction.elements;
              const bboxSystem = detectBboxSystem(rawElements);
              const normCw = parsedJson.canvasW ?? canvasW;
              const normCh = parsedJson.canvasH ?? canvasH;
              const normElements = bboxSystem === 'normalized' ? rawElements : rawElements.map(el => {
                const [y1, x1, y2, x2] = el.bbox;
                if (bboxSystem === 'fractional') return { ...el, bbox: [y1 * 1000, x1 * 1000, y2 * 1000, x2 * 1000] as [number, number, number, number] };
                return { ...el, bbox: [(y1 / normCh) * 1000, (x1 / normCw) * 1000, (y2 / normCh) * 1000, (x2 / normCw) * 1000] as [number, number, number, number] };
              });
              const qualityReport = validateLayout(normElements, normCw, normCh);
              setPendingQualityReport(qualityReport.overallPass ? null : qualityReport);
              resolve(true);
            } else {
              // 解析失败：保留失败文本 + 追加错误提示
              lastErrorText = buildParseErrorText(finalContent);
              addCanvasChatMessage(createAssistantMessage(`\n\n[Parse Error: 解析失败，正在重新生成...]`));
              resolve(false);
            }
          },
          onError: (err) => {
            const store = useEditorStore.getState();
            store.updateCanvasChatMessage(placeholderId, {
              content: (accumulatedContent.join('') || '') + `\n\n[Stream Error: ${err}]`,
            });
            resolve(false);
          },
        });
      });
    };

    while (hardRetryCount <= MAX_HARD_RETRIES) {
      const success = await doStreamAttempt();
      if (success) { setIsLoading(false); return; }
      hardRetryCount++;
    }

    // 超过最大重试次数 — 在最后一条错误消息后追加最终提示
    addCanvasChatMessage(createAssistantMessage(`Error: Failed after ${MAX_HARD_RETRIES + 1} attempts. Last error: ${lastErrorText.replace(/\n\n\[Parse Error\]\n/, '')}`));
    setIsLoading(false);
  }, [
    addCanvasChatMessage, getCurrentProvider, parseModel, chatModel,
    boxes, canvasW, canvasH, globalPalette, highLevelDescription,
    aesthetics, lighting, medium, artStyle, background, photoArtStyleMode,
    canvasChatMessages, chatResponseLang, setPendingIdeogramOutput, setPendingQualityReport,
  ]);

  /** Apply 确认弹窗的选中状态 */
  const [applySelections, setApplySelections] = useState<ApplySelections>({
    boxes: true,
    globalDesc: true,
    styleParams: true,
    globalPalette: true,
    modeSwitch: true,
  });

  /** 选择性 Apply pendingIdeogramOutput 到画布 */
  const applyOutput = useCallback((selections: ApplySelections) => {
    if (!pendingIdeogramOutput) return 0;

    const store = useEditorStore.getState();
    // 如果 LLM 返回的画布尺寸与 store 不同，同步更新
    if (pendingIdeogramOutput.canvasW && pendingIdeogramOutput.canvasH &&
        (pendingIdeogramOutput.canvasW !== store.canvasW || pendingIdeogramOutput.canvasH !== store.canvasH)) {
      store.setCanvasDimensions(pendingIdeogramOutput.canvasW, pendingIdeogramOutput.canvasH);
    }
    if (selections.boxes) {
      const elements = pendingIdeogramOutput.compositional_deconstruction.elements;
      const system = detectBboxSystem(elements);
      const cw = pendingIdeogramOutput.canvasW ?? store.canvasW;
      const ch = pendingIdeogramOutput.canvasH ?? store.canvasH;

      store.clearBoxes();
      elements.forEach(el => {
        const { x, y, w, h } = bboxToPixels(el.bbox, cw, ch, system);
        store.addBox({
          x, y, w, h,
          id: '',
          mode: el.type,
          text: el.text || '',
          desc: el.desc || '',
          colors: el.color_palette || [],
          imageDataUrl: null,
          imageRole: 'both' as const,
        });
      });
    }

    const sd = pendingIdeogramOutput.style_description;
    if (selections.globalDesc) {
      store.setGlobalSetting('highLevelDescription', pendingIdeogramOutput.high_level_description || '');
    }
    if (selections.styleParams) {
      store.setGlobalSetting('aesthetics', sd.aesthetics || '');
      store.setGlobalSetting('lighting', sd.lighting || '');
      store.setGlobalSetting('background', pendingIdeogramOutput.compositional_deconstruction.background || '');
      if ('photo' in sd) {
        store.setPhotoArtStyleMode(MODE_PHOTO);
        store.setGlobalSetting('medium', (sd.photo as string) || '');
        store.setGlobalSetting('artStyle', sd.medium || '');
      } else {
        store.setPhotoArtStyleMode(MODE_ARTSTYLE);
        store.setGlobalSetting('medium', sd.medium || '');
        store.setGlobalSetting('artStyle', sd.art_style || '');
      }
    }
    if (selections.globalPalette) {
      // clearGlobalPalette not available as single action — set directly
      (sd.color_palette || []).forEach(c => store.addGlobalColor(c));
    }
    // modeSwitch is already handled by styleParams (photo vs art_style detection)

    return pendingIdeogramOutput.compositional_deconstruction.elements.length;
  }, [pendingIdeogramOutput]);

  /** 手动折叠 */
  const handleClose = useCallback(() => {
    setCanvasChatOpen(false);
  }, [setCanvasChatOpen]);

  /** 清空历史 */
  const handleClearHistory = useCallback(() => {
    clearCanvasChat();
  }, [clearCanvasChat]);

  /** 构建模型下拉选项 */
  const modelOptions = providers.flatMap(p =>
    p.models.map(m => ({
      value: `${p.id}:${m}`,
      label: `${p.name || p.id} · ${m}`,
      provider: p,
    }))
  );

  /** 刷新提供商列表 */
  const refreshProviders = useCallback(() => {
    getLlmProviders().then(setProviders);
  }, []);

  /** 用户点击重新生成时的处理 */
  const handleRegenerate = useCallback(() => {
    const report = useEditorStore.getState().pendingQualityReport;
    if (!report) return;
    setPendingQualityReport(null);
    setPendingIdeogramOutput(null);
    // 找到最后一条 user 消息
    const msgs = useEditorStore.getState().canvasChatMessages;
    const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;
    // 用 feedback 重新调用 sendMessage
    sendMessage(lastUserMsg.content, { feedback: report.summaryText });
  }, [sendMessage, setPendingQualityReport, setPendingIdeogramOutput]);

  return {
    isCanvasChatOpen,
    messages,
    pendingIdeogramOutput,
    pendingQualityReport,
    isLoading,
    modelOptions,
    chatModel,
    chatResponseLang,
    sendMessage,
    applyOutput,
    applySelections,
    setApplySelections,
    handleClose,
    handleClearHistory,
    handleSelectModel: setChatModel,
    setChatResponseLang,
    refreshProviders,
    hasProviders: modelOptions.length > 0,
    handleRegenerate,
  };
}