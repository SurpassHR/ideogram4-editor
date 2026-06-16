import { useState, useCallback, useEffect } from 'react';
import { useEditorStore } from '../store';
import { getLlmProviders } from '../components/llm/api';
import { sendChatMessage, buildBoxChatSystemPrompt } from '../services/llm-chat';
import type { LlmProvider } from '../components/llm/types';
import type { ChatMessage } from '../types/chat';

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

  const addChatMessage = useEditorStore(s => s.addChatMessage);
  const markChatMessageAdopted = useEditorStore(s => s.markChatMessageAdopted);
  const updateBox = useEditorStore(s => s.updateBox);
  const closeChat = useEditorStore(s => s.closeChat);
  const clearChatHistory = useEditorStore(s => s.clearChatHistory);
  const setChatModel = useEditorStore(s => s.setChatModel);

  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载提供商列表
  useEffect(() => {
    if (isChatOpen) {
      getLlmProviders().then(setProviders);
    }
  }, [isChatOpen]);

  const currentBox = boxes.find(b => b.id === activeChatBoxId);
  const messages = activeChatBoxId ? (chatHistories[activeChatBoxId] || []) : [];

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

  // 发送消息
  const sendMessage = useCallback(async (content: string) => {
    if (!activeChatBoxId || !currentBox) return;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };

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

    try {
      const allMessages = [...messages, userMessage];
      const systemPrompt = buildBoxChatSystemPrompt(currentBox, {
        highLevelDescription,
        aesthetics,
        lighting,
        medium,
        artStyle,
        background,
        globalPalette,
        photoArtStyleMode,
      });

      const result = await sendChatMessage(provider, parsed.modelName, allMessages, systemPrompt);

      if (!result.ok) {
        setError(result.error || 'Unknown error');
        return;
      }

      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_ai`,
        role: 'assistant',
        content: result.content || '',
        timestamp: Date.now(),
      };

      addChatMessage(activeChatBoxId, assistantMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [activeChatBoxId, currentBox, messages, chatModel, getCurrentProvider, parseModel, addChatMessage, highLevelDescription, aesthetics, lighting, medium, artStyle, background, globalPalette, photoArtStyleMode]);

  // 采纳 AI 回复
  const adoptResponse = useCallback((messageId: string) => {
    if (!activeChatBoxId || !currentBox) return;
    const msg = messages.find(m => m.id === messageId);
    if (!msg || msg.role !== 'assistant') return;
    updateBox(activeChatBoxId, { desc: msg.content });
    markChatMessageAdopted(activeChatBoxId, messageId);
  }, [activeChatBoxId, currentBox, messages, updateBox, markChatMessageAdopted]);

  // 忽略（仅 UI 层面）
  const dismissResponse = useCallback((_messageId: string) => {
    // dismiss 仅影响 UI 渲染，不修改 store 数据
  }, []);

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
    handleClearHistory,
    handleClose,
    handleSelectModel,
    refreshProviders,
  };
}
