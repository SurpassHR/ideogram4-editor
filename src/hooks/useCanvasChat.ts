/**
 * Canvas Chat 逻辑 hook — 画布级 AI 构图对话。
 *
 * 功能：
 * - sendMessage: 构造消息（system prompt + 实时 generateJSON() 上下文 + 用户输入），
 *   调用 sendChatMessage()，解析回复中的 IdeogramOutput JSON
 * - applyToCanvas: 按用户勾选项部分写入 store（selectiveLoadFromJSON）
 * - 错误处理：JSON 解析失败保留原始回复不显示 Apply 按钮；LLM API 错误与 per-box ChatPanel 一致
 * - 清空对话历史
 * - 管理 selectedPreset / chatResponseLang / modelSelect（复用现有 chatModel 和 providers）
 *
 * 参考：useChatPanel.ts、spec 文件 docs/superpowers/specs/2026-06-17-canvas-ai-chat-design.md
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useEditorStore } from '../store';
import { getLlmProviders } from '../components/llm/api';
import { sendChatMessage } from '../services/llm-chat';
import {
  CANVAS_CHAT_SYSTEM_PROMPT,
  buildCanvasChatContext,
  extractAndValidateIdeogramJSON,
  type CanvasChatStoreSnapshot,
} from '../services/llm-canvas-chat';
import { parseBoxesFromJSON } from '../utils/json-serializer';
import { MODE_PHOTO, MODE_ARTSTYLE } from '../types';
import type { LlmProvider } from '../components/llm/types';
import type { ChatMessage } from '../types/chat';
import type { IdeogramOutput, Box } from '../types';

// ─── ApplySelections 类型 ────────────────────────────────────────────────

/** Apply 确认弹窗中用户勾选的项 */
export interface ApplySelections {
  boxes: boolean;
  globalDesc: boolean;
  styleParams: boolean;
  globalPalette: boolean;
}

/** 默认全选 */
export const DEFAULT_APPLY_SELECTIONS: ApplySelections = {
  boxes: true,
  globalDesc: true,
  styleParams: true,
  globalPalette: true,
};

// ─── selectiveLoadFromJSON ───────────────────────────────────────────────

/**
 * 按用户勾选项部分写入 store。不使用 loadFromJSON() 以避免一次性覆盖
 * 全部全局设置与选择性 Apply 冲突。
 */
function selectiveLoadFromJSON(
  json: IdeogramOutput,
  selections: ApplySelections,
  store: ReturnType<typeof useEditorStore.getState>,
): void {
  if (selections.boxes) {
    const parsedBoxes = parseBoxesFromJSON(json, store.canvasW, store.canvasH);
    store.clearBoxes();
    parsedBoxes.forEach(b => store.addBox(b));
  }

  const sd = json.style_description;

  if (selections.globalDesc) {
    store.setGlobalSetting('highLevelDescription', json.high_level_description);
  }

  if (selections.styleParams) {
    store.setGlobalSetting('aesthetics', sd.aesthetics);
    store.setGlobalSetting('lighting', sd.lighting);
    store.setGlobalSetting('background', json.compositional_deconstruction.background);

    if ('photo' in sd) {
      store.setPhotoArtStyleMode(MODE_PHOTO);
      store.setGlobalSetting('medium', (sd.photo as string) || '');
      store.setGlobalSetting('artStyle', (sd.medium as string) || '');
    } else {
      store.setPhotoArtStyleMode(MODE_ARTSTYLE);
      store.setGlobalSetting('medium', (sd.medium as string) || '');
      store.setGlobalSetting('artStyle', (sd.art_style as string) || '');
    }
  }

  if (selections.globalPalette) {
    // 清空现有全局调色板并逐色添加
    useEditorStore.setState({ globalPalette: [] });
    (sd.color_palette || []).forEach(c => store.addGlobalColor(c));
  }
}

// ─── useCanvasChat ───────────────────────────────────────────────────────

export function useCanvasChat() {
  // Chat 面板状态
  const isCanvasChatOpen = useEditorStore(s => s.isCanvasChatOpen);
  const canvasChatMessages = useEditorStore(s => s.canvasChatMessages);
  const pendingIdeogramOutput = useEditorStore(s => s.pendingIdeogramOutput);
  const chatModel = useEditorStore(s => s.chatModel);
  const chatResponseLang = useEditorStore(s => s.chatResponseLang);
  const chatPresets = useEditorStore(s => s.chatPresets);

  // 画布状态（用于构建上下文快照）
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

  // Actions
  const setCanvasChatOpen = useEditorStore(s => s.setCanvasChatOpen);
  const addCanvasChatMessage = useEditorStore(s => s.addCanvasChatMessage);
  const setPendingIdeogramOutput = useEditorStore(s => s.setPendingIdeogramOutput);
  const clearCanvasChat = useEditorStore(s => s.clearCanvasChat);
  const setChatModel = useEditorStore(s => s.setChatModel);
  const setChatResponseLang = useEditorStore(s => s.setChatResponseLang);

  // 本地状态
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState(false);

  // ─── 面板展开时加载提供商列表 ─────────────────────────────────────

  useEffect(() => {
    if (isCanvasChatOpen) {
      getLlmProviders().then(setProviders);
    }
  }, [isCanvasChatOpen]);

  // ─── 模型字符串解析 ──────────────────────────────────────────────

  const parseModel = useCallback((modelStr: string): { providerId: string; modelName: string } | null => {
    const idx = modelStr.indexOf(':');
    if (idx < 0) return null;
    return { providerId: modelStr.slice(0, idx), modelName: modelStr.slice(idx + 1) };
  }, []);

  const getCurrentProvider = useCallback((): LlmProvider | null => {
    const parsed = parseModel(chatModel);
    if (!parsed) return null;
    return providers.find(p => p.id === parsed.providerId) || null;
  }, [chatModel, providers, parseModel]);

  // ─── 画布上下文快照 ──────────────────────────────────────────────

  const buildSnapshot = useCallback((): CanvasChatStoreSnapshot => ({
    boxes: boxes.map((b: Box) => ({
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
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
    photoArtStyleMode: photoArtStyleMode as 0 | 1,
  }), [
    boxes, canvasW, canvasH, globalPalette,
    highLevelDescription, aesthetics, lighting,
    medium, artStyle, background, photoArtStyleMode,
  ]);

  // ─── 发送消息 ────────────────────────────────────────────────────

  /**
   * 构造消息（system prompt + 实时 generateJSON() 上下文 + 对话历史 + 用户输入），
   * 调用 sendChatMessage()，解析回复中的 IdeogramOutput JSON。
   *
   * 上下文策略：每轮都将当前 generateJSON() 的实时结果作为首条 user 消息传入 LLM，
   * 确保 AI 看到最新的画布状态（包括用户手动调整后的结果）。
   */
  const sendMessage = useCallback(async (content: string) => {
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    addCanvasChatMessage(userMessage);
    setIsLoading(true);
    setError(null);
    setApplySuccess(false);

    const provider = getCurrentProvider();
    if (!provider) {
      setError('No LLM provider configured. Please set up a provider in Settings.');
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
      // 构建实时画布上下文
      const snapshot = buildSnapshot();
      const contextJson = buildCanvasChatContext(snapshot);

      // 语言指令追加到 system prompt
      let langDirective = 'Respond in the same language the user uses.';
      if (chatResponseLang === 'en') langDirective = 'Your response MUST be in English.';
      else if (chatResponseLang === 'zh') langDirective = '你的回复必须使用中文。';

      const systemPrompt = CANVAS_CHAT_SYSTEM_PROMPT + '\n\n' + langDirective;

      // 上下文作为首条 user 消息，确保 LLM 在每轮对话都看到最新画布状态
      const contextMessage: ChatMessage = {
        id: 'ctx_canvas_context',
        role: 'user',
        content: `Here is the current canvas state for reference:\n\`\`\`json\n${contextJson}\n\`\`\``,
        timestamp: Date.now(),
      };

      // 当前对话历史（不含刚添加的 userMessage — Zustand selector 值来自上次渲染）
      const historyBefore = canvasChatMessages;

      // API 消息：[上下文 | 历史 | 新消息]
      const apiMessages: ChatMessage[] = [
        contextMessage,
        ...historyBefore,
        userMessage,
      ];

      const result = await sendChatMessage(provider, parsed.modelName, apiMessages, systemPrompt);

      if (!result.ok) {
        setError(result.error || 'Unknown error');
        return;
      }

      const aiText = result.content || '';

      // 提取并验证 IdeogramOutput JSON
      const ideogramOutput = extractAndValidateIdeogramJSON(aiText);

      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_ai`,
        role: 'assistant',
        content: aiText,
        timestamp: Date.now(),
      };

      addCanvasChatMessage(assistantMessage);

      // 仅 JSON 提取成功时设置 pendingIdeogramOutput（显示 Apply 按钮）
      setPendingIdeogramOutput(ideogramOutput);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [
    canvasChatMessages, chatModel, getCurrentProvider, parseModel,
    addCanvasChatMessage, setPendingIdeogramOutput,
    buildSnapshot, chatResponseLang,
  ]);

  // ─── Apply 到画布 ────────────────────────────────────────────────

  /**
   * 按用户勾选项将 pendingIdeogramOutput 选择性写入 store。
   * Apply 成功后：
   * - 最新 assistant 消息标记为 adopted
   * - pendingIdeogramOutput 清空
   * - 显示 ✓ 确认 2 秒后自动消失
   */
  const applyToCanvas = useCallback((selections: ApplySelections) => {
    const state = useEditorStore.getState();
    const output = state.pendingIdeogramOutput;
    if (!output) return;

    selectiveLoadFromJSON(output, selections, state);

    // 将最新 assistant 消息标记为 adopted
    const messages = state.canvasChatMessages;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        useEditorStore.setState({
          canvasChatMessages: messages.map((m, idx) =>
            idx === i ? { ...m, adopted: true } : m,
          ),
        });
        break;
      }
    }

    setPendingIdeogramOutput(null);
    setApplySuccess(true);
    setTimeout(() => setApplySuccess(false), 2000);
  }, [setPendingIdeogramOutput]);

  // ─── 清空对话历史 ────────────────────────────────────────────────

  const handleClearHistory = useCallback(() => {
    clearCanvasChat();
    setError(null);
    setApplySuccess(false);
  }, [clearCanvasChat]);

  // ─── 面板开关 ────────────────────────────────────────────────────

  const handleToggle = useCallback(() => {
    const current = useEditorStore.getState().isCanvasChatOpen;
    setCanvasChatOpen(!current);
  }, [setCanvasChatOpen]);

  // ─── 模型选择 ────────────────────────────────────────────────────

  const handleSelectModel = useCallback((modelStr: string) => {
    setChatModel(modelStr);
  }, [setChatModel]);

  // ─── 预设选择（Canvas 级预设模板为后续迭代功能）─────────────────

  const handleSelectPreset = useCallback((presetId: string | null) => {
    setSelectedPresetId(presetId);
  }, []);

  const selectedPreset = useMemo(
    () => (selectedPresetId ? chatPresets.find(p => p.id === selectedPresetId) || null : null),
    [selectedPresetId, chatPresets],
  );

  // ─── 模型下拉选项 ────────────────────────────────────────────────

  const modelOptions = providers.flatMap(p =>
    p.models.map(m => ({
      value: `${p.id}:${m}`,
      label: `${p.name || p.id} · ${m}`,
      provider: p,
    })),
  );

  // ─── 刷新提供商列表 ──────────────────────────────────────────────

  const refreshProviders = useCallback(() => {
    getLlmProviders().then(setProviders);
  }, []);

  // ─── 返回值 ──────────────────────────────────────────────────────

  return {
    /** 面板展开/折叠状态 */
    isCanvasChatOpen,
    /** 对话历史（不含上下文注入消息） */
    messages: canvasChatMessages,
    /** 最新 AI 回复中成功提取的 IdeogramOutput，null 表示无有效 JSON（不显示 Apply 按钮） */
    pendingIdeogramOutput,
    /** LLM 提供商列表 */
    providers,
    /** 模型下拉选项（格式 "providerId:modelName"） */
    modelOptions,
    /** 当前选中模型 */
    chatModel,
    /** 是否正在等待 LLM 回复 */
    isLoading,
    /** 错误信息（LLM API 错误 / 无提供商 / 无模型），与 per-box ChatPanel 一致 */
    error,
    /** Apply 成功确认（2s 后自动消失） */
    applySuccess,
    /** 发送消息（构造上下文 + 调用 LLM + 提取 JSON） */
    sendMessage,
    /** 按勾选项选择性写入 store */
    applyToCanvas,
    /** 清空对话历史 + pending JSON */
    handleClearHistory,
    /** 切换面板展开/折叠 */
    handleToggle,
    /** 选择模型 */
    handleSelectModel,
    /** 刷新提供商列表（配置面板关闭后） */
    refreshProviders,
    /** 预设列表 */
    chatPresets,
    /** 当前选中的预设 ID */
    selectedPresetId,
    /** 当前选中的预设对象（null 表示未选中） */
    selectedPreset,
    /** 选择预设 */
    handleSelectPreset,
    /** LLM 回复语言偏好 */
    chatResponseLang,
    /** 设置 LLM 回复语言 */
    setChatResponseLang,
  };
}
