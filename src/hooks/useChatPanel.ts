import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useEditorStore } from '../store';
import { getLlmProviders } from '../components/llm/api';
import { sendChatMessageWithOptions, abortActiveRequest } from '../services/llm-stream';
import { buildBoxChatJsonSystemPrompt, extractBoxChatJson } from '../services/llm-chat';
import { resolveTemplate } from '../utils/resolveTemplate';
import type { LlmProvider } from '../components/llm/types';
import type { ChatMessage } from '../types/chat';
import { createUserMessage } from '../types/chat';
import type { PromptPreset } from '../types/presets';

export function useChatPanel() {
  const activeChatBoxId = useEditorStore(s => s.activeChatBoxId);
  const isChatOpen = useEditorStore(s => s.isChatOpen);
  const chatHistories = useEditorStore(s => s.chatHistories);
  const chatModel = useEditorStore(s => s.chatModel);
  const boxes = useEditorStore(s => s.boxes);
  const highLevelDescription = useEditorStore(s => s.highLevelDescription);
  const aesthetics = useEditorStore(s => s.aesthetics);
  const lighting = useEditorStore(s => s.lighting);
  const medium = useEditorStore(s => s.medium);
  const artStyle = useEditorStore(s => s.artStyle);
  const background = useEditorStore(s => s.background);
  const globalPalette = useEditorStore(s => s.globalPalette);
  const photoArtStyleMode = useEditorStore(s => s.photoArtStyleMode);
  const chatPresets = useEditorStore(s => s.chatPresets);
  const addPreset = useEditorStore(s => s.addPreset);
  const updatePreset = useEditorStore(s => s.updatePreset);
  const deletePreset = useEditorStore(s => s.deletePreset);
  const chatResponseLang = useEditorStore(s => s.chatResponseLang);
  const setChatResponseLang = useEditorStore(s => s.setChatResponseLang);
  const chatStreamEnabled = useEditorStore(s => s.chatStreamEnabled);
  const chatThinkingLevel = useEditorStore(s => s.chatThinkingLevel);
  const systemPrompts = useEditorStore(s => s.systemPrompts);
  const activeBoxChatSystemPromptId = useEditorStore(s => s.activeBoxChatSystemPromptId);
  const selectedBoxSystemPrompt = activeBoxChatSystemPromptId
    ? systemPrompts.find(p => p.id === activeBoxChatSystemPromptId)
    : null;
  const customBoxSystemPrompt = selectedBoxSystemPrompt?.content ?? null;

  const addChatMessage = useEditorStore(s => s.addChatMessage);
  const markChatMessageAdopted = useEditorStore(s => s.markChatMessageAdopted);
  const updateBox = useEditorStore(s => s.updateBox);
  const closeChat = useEditorStore(s => s.closeChat);
  const clearChatHistory = useEditorStore(s => s.clearChatHistory);
  const setChatHistory = useEditorStore(s => s.setChatHistory);
  const setChatModel = useEditorStore(s => s.setChatModel);


  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  // 流式累积引用，避免闭包中读取过期 store 状态
  const contentRef = useRef('');
  const thinkingRef = useRef('');


  const currentBox = boxes.find(b => b.id === activeChatBoxId);
  const messages = activeChatBoxId ? (chatHistories[activeChatBoxId] || []) : [];

  // 可发送参考图：imageRole 为 'reference' 或 'both'
  const canSendImage = useMemo(() => {
    return currentBox && currentBox.imageDataUrl && currentBox.imageRole !== 'background'
      ? currentBox.imageDataUrl
      : undefined;
  }, [currentBox?.imageDataUrl, currentBox?.imageRole]);

  // 加载提供商列表
  useEffect(() => {
    if (isChatOpen) {
      getLlmProviders().then(setProviders);
    }
  }, [isChatOpen]);

  // 解析模型字符串 "providerId:modelName"
  const parseModel = useCallback((modelStr: string): { providerId: string; modelName: string } | null => {
    const idx = modelStr.indexOf(':');
    if (idx < 0) return null;
    return { providerId: modelStr.slice(0, idx), modelName: modelStr.slice(idx + 1) };
  }, []);

  // 获取当前 provider
  const getCurrentProvider = useCallback((): LlmProvider | null => {
    const parsed = parseModel(chatModel);
    if (!parsed) return null;
    return providers.find(p => p.id === parsed.providerId) || null;
  }, [chatModel, providers, parseModel]);

  // 发送消息（流式）
  const sendMessage = useCallback(async (content: string) => {
    if (!activeChatBoxId || !currentBox) return;

    const userMessage = createUserMessage(content);
    addChatMessage(activeChatBoxId, userMessage);
    setIsLoading(true);
    setError(null);

    const provider = getCurrentProvider();
    if (!provider) {
      setError('No provider selected');
      setIsLoading(false);
      return;
    }

    const parsed = parseModel(chatModel);
    if (!parsed) {
      setError('No model selected');
      setIsLoading(false);
      return;
    }

    // 创建占位 assistant 消息
    const placeholderId = `msg_${Date.now()}_stream`;
    const placeholder: ChatMessage = {
      id: placeholderId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    addChatMessage(activeChatBoxId, placeholder);

    // 重置累积引用
    contentRef.current = '';
    thinkingRef.current = '';

    try {
      // 从 store 直接读取最新消息列表，避免闭包中 messages 过期（如 retry 截断后）
      const currentMessages = activeChatBoxId
        ? (useEditorStore.getState().chatHistories[activeChatBoxId] || [])
        : [];
      const allMessages = [...currentMessages];
      const systemPrompt = buildBoxChatJsonSystemPrompt(currentBox, {
        highLevelDescription,
        aesthetics,
        lighting,
        medium,
        artStyle,
        background,
        globalPalette,
        photoArtStyleMode,
      }, chatResponseLang, customBoxSystemPrompt || undefined);

      const apiMessages = allMessages.map(m => ({ role: m.role, content: m.content }));

      await sendChatMessageWithOptions(
        provider, parsed.modelName, apiMessages, systemPrompt, {
          onChunk: ({ type, text }) => {
            if (type === 'thinking') {
              thinkingRef.current += text;
            } else {
              contentRef.current += text;
            }
            // 每次 chunk 写入完整累积内容，避免闭包中读取过期 store 状态
            useEditorStore.getState().updateChatHistoryMessage(
              activeChatBoxId, placeholderId,
              { content: contentRef.current, thinking: thinkingRef.current },
            );
          },
          onDone: () => {
            setIsLoading(false);
          },
          onAbort: () => {
            setIsLoading(false);
          },
          onError: (err) => {
            const errorMsg = `\n\n[Stream Error: ${err}]`;
            contentRef.current += errorMsg;
            useEditorStore.getState().updateChatHistoryMessage(
              activeChatBoxId, placeholderId,
              { content: contentRef.current },
            );
            setError(err);
            setIsLoading(false);
          },
        },
        {
          streamEnabled: chatStreamEnabled,
          thinkingLevel: chatThinkingLevel,
          imageDataUrl: canSendImage,
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsLoading(false);
    }
  }, [activeChatBoxId, currentBox, messages, chatModel, getCurrentProvider, parseModel, addChatMessage, highLevelDescription, aesthetics, lighting, medium, artStyle, background, globalPalette, photoArtStyleMode, canSendImage, chatResponseLang, chatStreamEnabled, chatThinkingLevel, customBoxSystemPrompt]);

  // 采纳 AI 回复
  const adoptResponse = useCallback((messageId: string) => {
    if (!activeChatBoxId || !currentBox) return;
    const msg = messages.find(m => m.id === messageId);
    if (!msg || msg.role !== 'assistant') return;

    // 尝试结构化 JSON 解析 => 同时更新 desc + colors + text（不改变位置）
    const parsed = extractBoxChatJson(msg.content);
    if (parsed) {
      const updates: Record<string, unknown> = { desc: parsed.desc };
      if (parsed.colors && parsed.colors.length > 0) {
        updates.colors = parsed.colors;
      }
      if (parsed.text && currentBox.mode === 'text') {
        updates.text = parsed.text;
      }
      updateBox(activeChatBoxId, updates);
    } else {
      // 兜底：写入完整文本到 desc（保持旧行为）
      updateBox(activeChatBoxId, { desc: msg.content });
    }

    markChatMessageAdopted(activeChatBoxId, messageId);
  }, [activeChatBoxId, currentBox, messages, updateBox, markChatMessageAdopted]);

  // 忽略（仅 UI 层面）
  const dismissResponse = useCallback((_messageId: string) => {
    // dismiss 仅影响 UI 渲染，不修改 store 数据
  }, []);

  // 重试：重新发送触发该 assistant 消息的用户消息，替换当前及后续消息
  const retryResponse = useCallback((messageId: string) => {
    if (!activeChatBoxId) return;
    const msgs = chatHistories[activeChatBoxId] || [];
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx <= 0) return; // 需要前面有一条用户消息

    // 找到该 assistant 消息之前的最后一条用户消息
    let userMsgIdx = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        userMsgIdx = i;
        break;
      }
    }
    if (userMsgIdx < 0) return;

    const userMsg = msgs[userMsgIdx];
    // 截断：保留到用户消息之前（不含该用户消息及其之后的所有内容）
    const kept = msgs.slice(0, userMsgIdx);
    setChatHistory(activeChatBoxId, kept);

    // 重新发送该用户消息
    sendMessage(userMsg.content);
  }, [activeChatBoxId, chatHistories, setChatHistory, sendMessage]);

  // 编辑用户消息后重新发送
  const editAndSend = useCallback((messageId: string, newContent: string) => {
    if (!activeChatBoxId) return;
    const msgs = chatHistories[activeChatBoxId] || [];
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx < 0) return;

    // 截断：保留该消息之前的所有消息
    const kept = msgs.slice(0, idx);
    setChatHistory(activeChatBoxId, kept);

    // 发送编辑后的消息
    sendMessage(newContent);
  }, [activeChatBoxId, chatHistories, setChatHistory, sendMessage]);

  // 清空历史
  const handleClearHistory = useCallback(() => {
    if (!activeChatBoxId) return;
    clearChatHistory(activeChatBoxId);
  }, [activeChatBoxId, clearChatHistory]);

  // 关闭面板
  const handleClose = useCallback(() => {
    closeChat();
  }, [closeChat]);

  // 选择模型
  const handleSelectModel = useCallback((modelStr: string) => {
    setChatModel(modelStr);
  }, [setChatModel]);

  // 构建模型下拉选项
  const modelOptions = providers.flatMap(p =>
    p.models.map(m => ({
      value: `${p.id}:${m}`,
      label: `${p.name || p.id} · ${m}`,
      provider: p,
    }))
  );

  // 刷新提供商列表（配置面板关闭后）
  const refreshProviders = useCallback(() => {
    getLlmProviders().then(setProviders);
  }, []);

  // 选择预设
  const handleSelectPreset = useCallback((presetId: string | null) => {
    setSelectedPresetId(presetId);
  }, []);

  // 获取选中预设
  const selectedPreset = useMemo(
    () => (selectedPresetId ? chatPresets.find(p => p.id === selectedPresetId) || null : null),
    [selectedPresetId, chatPresets],
  );

  // 手动停止当前生成请求
  const stopGeneration = useCallback(() => {
    setIsLoading(false);
    abortActiveRequest();
  }, []);

  return {
    isChatOpen,
    activeChatBoxId,
    currentBox,
    messages,
    providers,
    modelOptions,
    chatModel,
    isLoading,
    error,
    sendMessage,
    adoptResponse,
    dismissResponse,
    retryResponse,
    editAndSend,
    stopGeneration,
    handleClearHistory,
    handleClose,
    handleSelectModel,
    refreshProviders,
    // 预设
    chatPresets,
    addPreset,
    updatePreset,
    deletePreset,
    selectedPresetId,
    selectedPreset,
    handleSelectPreset,
    // 系统提示词
    systemPrompts,
    activeBoxChatSystemPromptId,
    // LLM 回复语言
    chatResponseLang,
    setChatResponseLang,
  };
}
