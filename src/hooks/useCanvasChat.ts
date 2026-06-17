import { useState, useCallback, useEffect, useMemo } from 'react';
import { useEditorStore } from '../store';
import { getLlmProviders } from '../components/llm/api';
import { sendChatMessage } from '../services/llm-chat';
import { CANVAS_CHAT_SYSTEM_PROMPT, buildCanvasChatContext, extractAndValidateIdeogramJSON } from '../services/llm-canvas-chat';
import { generateMessageId, createUserMessage, createAssistantMessage } from '../types/chat';
import type { LlmProvider } from '../components/llm/types';
import type { ChatMessage } from '../types/chat';
import type { IdeogramOutput } from '../types';
import { MODE_PHOTO, MODE_ARTSTYLE } from '../types';

/** Apply 确认弹窗中各部分的选中状态 */
export interface ApplySelections {
  boxes: boolean;
  globalDesc: boolean;
  styleParams: boolean;
  globalPalette: boolean;
  modeSwitch: boolean;
}

export function useCanvasChat() {
  const isCanvasChatOpen = useEditorStore(s => s.isCanvasChatOpen);
  const canvasChatMessages = useEditorStore(s => s.canvasChatMessages);
  const pendingIdeogramOutput = useEditorStore(s => s.pendingIdeogramOutput);
  const setCanvasChatOpen = useEditorStore(s => s.setCanvasChatOpen);
  const addCanvasChatMessage = useEditorStore(s => s.addCanvasChatMessage);
  const setPendingIdeogramOutput = useEditorStore(s => s.setPendingIdeogramOutput);
  const clearCanvasChat = useEditorStore(s => s.clearCanvasChat);
  const chatModel = useEditorStore(s => s.chatModel);
  const chatResponseLang = useEditorStore(s => s.chatResponseLang);
  const setChatModel = useEditorStore(s => s.setChatModel);
  const setChatResponseLang = useEditorStore(s => s.setChatResponseLang);

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
  const [isLoading, setIsLoading] = useState(false);

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

  /** 发送消息 */
  const sendMessage = useCallback(async (content: string) => {
    const userMessage = createUserMessage(content);
    addCanvasChatMessage(userMessage);
    setIsLoading(true);

    const provider = getCurrentProvider();
    if (!provider) {
      // 追加错误 assistant 消息
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

    try {
      // 构造上下文
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
      const contextJson = buildCanvasChatContext(snapshot);

      // 构造消息列表：每轮都附带当前上下文
      const allMessages = [...canvasChatMessages, userMessage];
      const apiMessages = allMessages.map(m => ({ role: m.role, content: m.content }));

      // 在最后一条 user 消息前插入上下文
      const lastUserIdx = apiMessages.map((m, i) => (m.role === 'user' ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
      if (lastUserIdx >= 0) {
        const original = apiMessages[lastUserIdx];
        apiMessages[lastUserIdx] = {
          role: 'user',
          content: `Current canvas state (JSON prompt):\n\`\`\`json\n${contextJson}\n\`\`\`\n\nMy composition request: ${original.content}`,
        };
      }

      // 语言偏好 append 到 system prompt
      let langHint = '';
      if (chatResponseLang === 'en') {
        langHint = '\nYou MUST respond in English.';
      } else if (chatResponseLang === 'zh') {
        langHint = '\n你必须用中文回复。';
      }

      const result = await sendChatMessage(provider, parsed.modelName, allMessages, CANVAS_CHAT_SYSTEM_PROMPT + langHint);

      if (!result.ok) {
        addCanvasChatMessage(createAssistantMessage(`Error: ${result.error || 'Unknown error'}`));
        setIsLoading(false);
        return;
      }

      const aiText = result.content || '';
      const assistantMessage = createAssistantMessage(aiText);
      addCanvasChatMessage(assistantMessage);

      // 尝试提取 JSON
      const parsedJson = extractAndValidateIdeogramJSON(aiText);
      setPendingIdeogramOutput(parsedJson);
    } catch (err) {
      addCanvasChatMessage(createAssistantMessage(`Error: ${err instanceof Error ? err.message : String(err)}`));
    } finally {
      setIsLoading(false);
    }
  }, [
    addCanvasChatMessage, getCurrentProvider, parseModel, chatModel,
    boxes, canvasW, canvasH, globalPalette, highLevelDescription,
    aesthetics, lighting, medium, artStyle, background, photoArtStyleMode,
    canvasChatMessages, chatResponseLang, setPendingIdeogramOutput,
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
    const { canvasW: cw, canvasH: ch } = store;

    if (selections.boxes) {
      // 手动解析 boxes
      store.clearBoxes();
      pendingIdeogramOutput.compositional_deconstruction.elements.forEach((el, i) => {
        const [y1, x1, y2, x2] = el.bbox;
        const box = {
          x: (x1 / 1000) * cw,
          y: (y1 / 1000) * ch,
          w: ((x2 - x1) / 1000) * cw,
          h: ((y2 - y1) / 1000) * ch,
          mode: el.type,
          text: el.text || '',
          desc: el.desc || '',
          colors: el.color_palette || [],
          imageDataUrl: null,
          imageRole: 'both' as const,
        };
        store.addBox({ ...box, id: '' });
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

  return {
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
    handleClearHistory,
    handleSelectModel: setChatModel,
    setChatResponseLang,
    refreshProviders,
    hasProviders: modelOptions.length > 0,
  };
}