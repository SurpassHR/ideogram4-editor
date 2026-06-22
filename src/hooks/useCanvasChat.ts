import { useState, useCallback, useEffect, useMemo } from 'react';
import { useEditorStore } from '../store';
import { getLlmProviders } from '../components/llm/api';
import { sendChatMessageWithOptions, abortActiveRequest } from '../services/llm-stream';
import { CANVAS_CHAT_SYSTEM_PROMPT, buildCanvasChatContext, buildLayoutFeedbackPrompt, extractAndValidateIdeogramJSON } from '../services/llm-canvas-chat';
import { buildMultimodalMessages } from '../services/llm-chat';
import { validateLayout } from '../services/layout-validator';
import { generateMessageId, createUserMessage, createAssistantMessage } from '../types/chat';
import type { LlmProvider, ProviderKind } from '../components/llm/types';
import { DEFAULT_BASE_URLS } from '../components/llm/types';
import type { ChatMessage, ChatMessageForApi } from '../types/chat';
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

  const TARGET_W = 360;
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

function extractJsonCodeBlock(text: string): string | undefined {
  return text.match(/```json\s*([\s\S]*?)```/)?.[1]?.trim();
}

/** 构建原始 HTTP 请求格式的字符串，用于 Terminal 详情展示 */
function buildHttpRequestString(
  providerKind: ProviderKind,
  baseUrl: string,
  model: string,
  systemPrompt: string,
  apiMessages: ChatMessageForApi[],
  streamEnabled: boolean,
  thinkingLevel: string,
  imageDataUrl?: string,
): string {
  let path: string;
  let body: Record<string, unknown>;
  let extraHeaders: Record<string, string> = {};

  // 应用多模态转换（与实际发送逻辑一致）
  const effectiveMessages = imageDataUrl
    ? buildMultimodalMessages(apiMessages, imageDataUrl, providerKind)
    : apiMessages;

  switch (providerKind) {
    case 'openai':
    case 'openai_compat': {
      path = '/chat/completions';
      const msgs = [{ role: 'system', content: systemPrompt }, ...effectiveMessages];
      body = {
        model,
        messages: msgs,
        stream: streamEnabled,
      };
      if (thinkingLevel !== 'off' && providerKind === 'openai') {
        (body as Record<string, unknown>).reasoning_effort = thinkingLevel;
      }
      extraHeaders = { Authorization: 'Bearer sk-••••••••' };
      break;
    }
    case 'anthropic': {
      path = '/messages';
      body = {
        model,
        max_tokens: 4096,
        stream: streamEnabled,
        system: systemPrompt,
        messages: effectiveMessages,
      };
      if (thinkingLevel !== 'off') {
        (body as Record<string, unknown>).thinking = {
          type: 'enabled',
          budget_tokens: thinkingLevel === 'low' ? 1024 : thinkingLevel === 'medium' ? 2048 : 3072,
        };
      }
      extraHeaders = {
        'x-api-key': 'sk-ant-••••••••',
        'anthropic-version': '2023-06-01',
      };
      break;
    }
    case 'gemini': {
      const suffix = streamEnabled
        ? `:streamGenerateContent?alt=sse&key=••••••••`
        : `:generateContent?key=••••••••`;
      path = `/models/${model}${suffix}`;
      const contents = effectiveMessages.map(m => {
        if (Array.isArray(m.content)) {
          // 多模态：图片 + 文本
          const parts = (m.content as Record<string, unknown>[]).map((part: Record<string, unknown>) => {
            if (part.type === 'image_url') {
              return {
                inlineData: {
                  mimeType: 'image/png',
                  data: '[base64 image data]',
                },
              };
            }
            return { text: part.text as string };
          });
          return { role: m.role === 'assistant' ? 'model' : 'user', parts };
        }
        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content as string }],
        };
      });
      body = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
      };
      break;
    }
    default: {
      path = '/chat/completions';
      const msgs = [{ role: 'system', content: systemPrompt }, ...effectiveMessages];
      body = { model, messages: msgs };
    }
  }

  // 从 baseUrl 中提取 host，构造路径
  let host: string;
  let urlPath: string;
  try {
    const u = new URL(baseUrl);
    host = u.host;
    urlPath = `${u.pathname.replace(/\/$/, '')}${path}`;
  } catch {
    host = baseUrl;
    urlPath = path;
  }

  const bodyJson = JSON.stringify(body, (key, value) => {
    // 截断过长的 base64 Data URL / 字符串
    if (typeof value === 'string' && value.startsWith('data:image')) {
      const commaIdx = value.indexOf(',');
      const header = commaIdx > 0 ? value.slice(0, commaIdx) : value.slice(0, 40);
      return `${header},[base64: ~${Math.round((value.length - (commaIdx > 0 ? commaIdx + 1 : 0)) * 0.75)} bytes]`;
    }
    return value;
  }, 2);
  const lines: string[] = [
    `POST ${urlPath} HTTP/1.1`,
    `Host: ${host}`,
    'Content-Type: application/json',
    ...Object.entries(extraHeaders).map(([k, v]) => `${k}: ${v}`),
    `Content-Length: ${new TextEncoder().encode(bodyJson).length}`,
    '',
    bodyJson,
  ];
  return lines.join('\n');
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
  const startCanvasChatRequest = useEditorStore(s => s.startCanvasChatRequest);
  const appendCanvasChatRequestStep = useEditorStore(s => s.appendCanvasChatRequestStep);
  const updateCanvasChatRequestDetail = useEditorStore(s => s.updateCanvasChatRequestDetail);
  const finishCanvasChatRequest = useEditorStore(s => s.finishCanvasChatRequest);
  const chatModel = useEditorStore(s => s.chatModel);
  const chatResponseLang = useEditorStore(s => s.chatResponseLang);
  const chatStreamEnabled = useEditorStore(s => s.chatStreamEnabled);
  const systemPrompts = useEditorStore(s => s.systemPrompts);
  const canvasBackgroundUrl = useEditorStore(s => s.canvasBackgroundUrl);
  const activeCanvasChatSystemPromptId = useEditorStore(s => s.activeCanvasChatSystemPromptId);
  const selectedCanvasSystemPrompt = activeCanvasChatSystemPromptId
    ? systemPrompts.find(p => p.id === activeCanvasChatSystemPromptId)
    : null;
  const customCanvasSystemPrompt = selectedCanvasSystemPrompt?.content ?? null;
  const chatThinkingLevel = useEditorStore(s => s.chatThinkingLevel);
  const canvasChatTargetSize = useEditorStore(s => s.canvasChatTargetSize);
  const setChatModel = useEditorStore(s => s.setChatModel);
  const setChatResponseLang = useEditorStore(s => s.setChatResponseLang);
  const setCanvasChatTargetSize = useEditorStore(s => s.setCanvasChatTargetSize);
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
  // 预设 + 当前选中 box（用于解析模板变量）
  const chatPresets = useEditorStore(s => s.chatPresets);
  const selectedBoxId = useEditorStore(s => s.selectedBoxId);

  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
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

  /** 构建解析失败的错误文本，用于终端日志与用户排查 */
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
    const requestId = startCanvasChatRequest(content.slice(0, 80));
    const userMessage = createUserMessage(content);
    const snapshotUrl = await takeCanvasSnapshot();
    appendCanvasChatRequestStep(requestId, {
      kind: 'snapshot',
      status: snapshotUrl ? 'success' : 'error',
      label: snapshotUrl ? 'Canvas snapshot captured' : 'Canvas snapshot unavailable',
      detail: snapshotUrl ? undefined : '未找到可截图的 canvas-wrapper，继续发送请求。',
    });
    userMessage.canvasSnapshotUrl = snapshotUrl;
    addCanvasChatMessage(userMessage);
    setIsLoading(true);

    const provider = getCurrentProvider();
    if (!provider) {
      addCanvasChatMessage(createAssistantMessage('No LLM provider selected.'));
      appendCanvasChatRequestStep(requestId, {
        kind: 'provider_ready',
        status: 'error',
        label: 'LLM provider missing',
        detail: 'No LLM provider selected.',
      });
      finishCanvasChatRequest(requestId, 'error', 'No LLM provider selected.');
      setIsLoading(false);
      return;
    }

    const parsed = parseModel(chatModel);
    if (!parsed) {
      addCanvasChatMessage(createAssistantMessage('No model selected.'));
      appendCanvasChatRequestStep(requestId, {
        kind: 'provider_ready',
        status: 'error',
        label: 'Model missing',
        detail: `Invalid chat model value: ${chatModel}`,
      });
      finishCanvasChatRequest(requestId, 'error', 'No model selected.');
      setIsLoading(false);
      return;
    }

    // 从 store 实时读取最新状态，避免闭包中的过时数据
    const state = useEditorStore.getState();
    const snapshot = {
      boxes: state.boxes.map(b => ({
        x: b.x, y: b.y, w: b.w, h: b.h,
        mode: b.mode,
        text: b.text,
        desc: b.desc,
        colors: b.colors,
        imageDataUrl: b.imageDataUrl,
        imageRole: b.imageRole,
      })),
      canvasW: state.canvasW,
      canvasH: state.canvasH,
      globalPalette: state.globalPalette,
      highLevelDescription: state.highLevelDescription,
      aesthetics: state.aesthetics,
      lighting: state.lighting,
      medium: state.medium,
      artStyle: state.artStyle,
      background: state.background,
      photoArtStyleMode: state.photoArtStyleMode,
      canvasBackgroundUrl: state.canvasBackgroundUrl,
    };
    appendCanvasChatRequestStep(requestId, {
      kind: 'build_context',
      status: 'success',
      label: 'Build canvas context',
      detail: `${snapshot.boxes.length} boxes, current ${canvasW}x${canvasH}, target ${canvasChatTargetSize}x${canvasChatTargetSize}, ${globalPalette.length} global colors`,
    });
    appendCanvasChatRequestStep(requestId, {
      kind: 'provider_ready',
      status: 'success',
      label: 'Provider and model ready',
      detail: `${provider.name || provider.id} · ${parsed.modelName}`,
    });
    updateCanvasChatRequestDetail(requestId, {
      metadata: {
        providerId: provider.id,
        providerName: provider.name || provider.id,
        modelName: parsed.modelName,
        responseLang: chatResponseLang,
        streamEnabled: chatStreamEnabled,
        thinkingLevel: chatThinkingLevel,
        targetSize: canvasChatTargetSize,
        canvasSize: { width: canvasW, height: canvasH },
        boxCount: snapshot.boxes.length,
        backgroundImageAttached: !!canvasBackgroundUrl,
      },
    });

    // 语言偏好 append 到 system prompt
    let langHint = '';
    if (chatResponseLang === 'en') {
      langHint = '\nYou MUST respond in English.';
    } else if (chatResponseLang === 'zh') {
      langHint = '\n你必须用中文回复。';
    }

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
    // 从 store 直接读取消息列表（retry 截断后需要最新状态）
    // 过滤掉尚未完成的 stream 占位消息
    const rawMessages = useEditorStore.getState().canvasChatMessages;
    const allMessages = rawMessages.filter(m => !(m.role === 'assistant' && m.content === ''));
    const apiMessages: ChatMessageForApi[] = allMessages.map(m => ({ role: m.role, content: m.content }));
    const lastUserIdx = apiMessages.map((m, i) => (m.role === 'user' ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    if (lastUserIdx >= 0) {
      const bgHint = canvasBackgroundUrl
        ? 'Background reference image: present (attached to this message)'
        : 'Background reference image: none';
      const targetHint = [
        `Target output canvas: ${canvasChatTargetSize} x ${canvasChatTargetSize}`,
        'Keep bbox values in the 0-1000 normalized coordinate system; do not use 1024 as a default canvas size.',
        bgHint,
      ].join('\n');
      let enriched = `${targetHint}\n\nCurrent canvas state (JSON prompt):\n\`\`\`json\n${contextJson}\n\`\`\`\n\nMy composition request: ${apiMessages[lastUserIdx].content}`;
      if (retryContext?.feedback) enriched += buildLayoutFeedbackPrompt(retryContext.feedback);
      apiMessages[lastUserIdx] = { role: 'user', content: enriched };
    }
    const systemPrompt = (customCanvasSystemPrompt || CANVAS_CHAT_SYSTEM_PROMPT) + langHint;
    const hostUrl = provider.base_url || DEFAULT_BASE_URLS[provider.kind];
    const requestBody = buildHttpRequestString(
      provider.kind,
      hostUrl,
      parsed.modelName,
      systemPrompt,
      apiMessages,
      chatStreamEnabled,
      chatThinkingLevel,
      canvasBackgroundUrl || undefined,
    );
    updateCanvasChatRequestDetail(requestId, {
      systemPrompt,
      messages: apiMessages,
      requestBody,
      contextJson,
    });

    const accumulatedContent: string[] = [];
    const accumulatedThinking: string[] = [];
    let loggedFirstChunk = false;

    appendCanvasChatRequestStep(requestId, {
      kind: 'stream_start',
      status: 'running',
      label: 'Start LLM stream',
      detail: `${provider.name || provider.id} · ${parsed.modelName}`,
    });

    const abortHandler = (resolve: () => void) => {
      const store = useEditorStore.getState();
      store.updateCanvasChatMessage(placeholderId, { content: '\n\n[Request cancelled by user]' });
      appendCanvasChatRequestStep(requestId, {
        kind: 'error',
        status: 'error',
        label: 'Aborted by user',
      });
      finishCanvasChatRequest(requestId, 'error', 'Request stopped by user.');
      setIsLoading(false);
      resolve();
    };

    await new Promise<void>((resolve) => {
      let settled = false;
      const markSettled = () => { settled = true; };
      const finishWithError = (err: string) => {
        if (settled) return;
        markSettled();
        const partialResponse = accumulatedContent.join('');
        const store = useEditorStore.getState();
        store.updateCanvasChatMessage(placeholderId, {
          content: (partialResponse || '') + `\n\n[Stream Error: ${err}]`,
        });
        updateCanvasChatRequestDetail(requestId, {
          ...(partialResponse ? { responseText: partialResponse } : {}),
          parseError: err,
        });
        appendCanvasChatRequestStep(requestId, {
          kind: 'error',
          status: 'error',
          label: 'Stream failed',
          detail: err,
        });
        finishCanvasChatRequest(requestId, 'error', err);
        setIsLoading(false);
        resolve();
      };

      const streamResult = sendChatMessageWithOptions(provider, parsed.modelName, apiMessages, systemPrompt, {
        onChunk: ({ type, text }) => {
          if (type === 'thinking') {
            accumulatedThinking.push(text);
          } else {
            accumulatedContent.push(text);
          }
          if (!loggedFirstChunk) {
            loggedFirstChunk = true;
            appendCanvasChatRequestStep(requestId, {
              kind: 'stream_chunk',
              status: 'running',
              label: 'Receive first stream chunk',
            });
          }
          const store = useEditorStore.getState();
          store.updateCanvasChatMessage(placeholderId, {
            content: accumulatedContent.join(''),
            thinking: accumulatedThinking.join(''),
          });
        },
        onDone: async (fullText) => {
          if (settled) return;
          markSettled();
          const finalContent = accumulatedContent.join('') || fullText;
          const finalThinking = accumulatedThinking.join('');
          useEditorStore.getState().updateCanvasChatMessage(placeholderId, {
            content: finalContent,
            thinking: finalThinking || undefined,
          });
          appendCanvasChatRequestStep(requestId, {
            kind: 'stream_done',
            status: 'success',
            label: 'LLM stream completed',
            detail: `${finalContent.length} content chars`,
          });
          updateCanvasChatRequestDetail(requestId, {
            responseText: finalContent,
            parsedJsonText: extractJsonCodeBlock(finalContent),
          });

          const parsedJson = extractAndValidateIdeogramJSON(finalContent);
          if (parsedJson !== null) {
            setPendingIdeogramOutput(parsedJson);
            appendCanvasChatRequestStep(requestId, {
              kind: 'parse_success',
              status: 'success',
              label: 'Parse Ideogram JSON',
              detail: `${parsedJson.compositional_deconstruction.elements.length} elements`,
            });

            setPendingQualityReport(null);
            appendCanvasChatRequestStep(requestId, {
              kind: 'done',
              status: 'success',
              label: 'Ready to apply',
              detail: 'JSON is valid. Layout quality will be diagnosed after Apply.',
            });
            finishCanvasChatRequest(requestId, 'success');
          } else {
            const errorText = buildParseErrorText(finalContent);
            const parseError = errorText.replace(/\n\n\[Parse Error\]\n/, '');
            updateCanvasChatRequestDetail(requestId, {
              parsedJsonText: extractJsonCodeBlock(finalContent),
              parseError,
            });
            appendCanvasChatRequestStep(requestId, {
              kind: 'parse_failed',
              status: 'error',
              label: 'Parse Ideogram JSON failed',
              detail: parseError,
            });
            finishCanvasChatRequest(requestId, 'error', parseError);
          }
          setIsLoading(false);
          resolve();
        },
        onAbort: () => abortHandler(resolve),
        onError: finishWithError,
      }, {
        streamEnabled: chatStreamEnabled,
        thinkingLevel: chatThinkingLevel,
        imageDataUrl: canvasBackgroundUrl || undefined,
      });

      if (canvasBackgroundUrl) {
        appendCanvasChatRequestStep(requestId, {
          kind: 'snapshot',
          status: 'success',
          label: 'Background image attached',
          detail: `${canvasBackgroundUrl.slice(0, 40)}... (${Math.round(canvasBackgroundUrl.length * 0.75)} bytes)`,
        });
      }

      void Promise.resolve(streamResult).catch(err => {
        finishWithError(err instanceof Error ? err.message : String(err));
      });
    });
  }, [
    startCanvasChatRequest, appendCanvasChatRequestStep, updateCanvasChatRequestDetail, addCanvasChatMessage, getCurrentProvider,
    parseModel, chatModel, finishCanvasChatRequest,
    boxes, canvasW, canvasH, globalPalette, highLevelDescription,
    aesthetics, lighting, medium, artStyle, background, photoArtStyleMode,
    canvasChatMessages, chatResponseLang, chatStreamEnabled, chatThinkingLevel, canvasChatTargetSize, customCanvasSystemPrompt, systemPrompts, activeCanvasChatSystemPromptId, setPendingIdeogramOutput, setPendingQualityReport, canvasBackgroundUrl,
  ]);

  /** 将给定的 IdeogramOutput 应用到画布，并基于已落地布局生成质量诊断 */
  const applyIdeogramOutput = useCallback((output: IdeogramOutput): number => {
    const store = useEditorStore.getState();
    // 如果 LLM 返回的画布尺寸与 store 不同，同步更新
    if (output.canvasW && output.canvasH &&
        (output.canvasW !== store.canvasW || output.canvasH !== store.canvasH)) {
      store.setCanvasDimensions(output.canvasW, output.canvasH);
    }
    const elements = output.compositional_deconstruction.elements;
    const system = detectBboxSystem(elements);
    const cw = output.canvasW ?? store.canvasW;
    const ch = output.canvasH ?? store.canvasH;

    store.clearBoxes();
    elements.forEach(el => {
      const { x, y, w, h } = bboxToPixels(el.bbox, cw, ch, system);
      store.addBox({
        x, y, w, h,
        mode: el.type,
        text: el.text || '',
        desc: el.desc || '',
        colors: el.color_palette || [],
        imageDataUrl: null,
        imageRole: 'both' as const,
      });
    });

    const sd = output.style_description;
    store.setGlobalSetting('highLevelDescription', output.high_level_description || '');
    store.setGlobalSetting('aesthetics', sd.aesthetics || '');
    store.setGlobalSetting('lighting', sd.lighting || '');
    store.setGlobalSetting('background', output.compositional_deconstruction.background || '');
    if ('photo' in sd) {
      store.setPhotoArtStyleMode(MODE_PHOTO);
      store.setGlobalSetting('medium', (sd.photo as string) || '');
      store.setGlobalSetting('artStyle', sd.medium || '');
    } else {
      store.setPhotoArtStyleMode(MODE_ARTSTYLE);
      store.setGlobalSetting('medium', sd.medium || '');
      store.setGlobalSetting('artStyle', sd.art_style || '');
    }
    (sd.color_palette || []).forEach(c => store.addGlobalColor(c));

    const normalizedElements = system === 'normalized' ? elements : elements.map(el => {
      const [y1, x1, y2, x2] = el.bbox;
      if (system === 'fractional') return { ...el, bbox: [y1 * 1000, x1 * 1000, y2 * 1000, x2 * 1000] as [number, number, number, number] };
      return { ...el, bbox: [(y1 / ch) * 1000, (x1 / cw) * 1000, (y2 / ch) * 1000, (x2 / cw) * 1000] as [number, number, number, number] };
    });
    store.setPendingQualityReport(validateLayout(normalizedElements, cw, ch));

    return output.compositional_deconstruction.elements.length;
  }, []);

  /** 解析消息内容中的 IdeogramOutput 并应用到画布 */
  const applyMessageOutput = useCallback((message: ChatMessage): number | null => {
    const parsed = extractAndValidateIdeogramJSON(message.content);
    if (!parsed) return null;
    setPendingIdeogramOutput(parsed);
    return applyIdeogramOutput(parsed);
  }, [applyIdeogramOutput, setPendingIdeogramOutput]);

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

  /** 当前选中的 box（画布级对话无 currentBox，以画布选中 box 作为模板变量来源） */
  const selectedBox = useMemo(
    () => (selectedBoxId ? boxes.find(b => b.id === selectedBoxId) || null : null),
    [selectedBoxId, boxes],
  );

  /** 获取选中预设 */
  const selectedPreset = useMemo(
    () => (selectedPresetId ? chatPresets.find(p => p.id === selectedPresetId) || null : null),
    [selectedPresetId, chatPresets],
  );

  /** 选择预设 */
  const handleSelectPreset = useCallback((presetId: string | null) => {
    setSelectedPresetId(presetId);
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

  /** 重试：重新发送触发指定 assistant 消息的用户消息 */
  const retryMessage = useCallback((messageId: string) => {
    const msgs = useEditorStore.getState().canvasChatMessages;
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx <= 0) return;

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
    // 截断：保留到用户消息之前
    const kept = msgs.slice(0, userMsgIdx);
    useEditorStore.getState().setCanvasChatMessages(kept);

    // 重新发送
    sendMessage(userMsg.content);
  }, [sendMessage]);

  /** 编辑用户消息后重新发送 */
  const editAndSend = useCallback((messageId: string, newContent: string) => {
    const msgs = useEditorStore.getState().canvasChatMessages;
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx < 0) return;

    // 截断：保留该消息之前的所有消息
    const kept = msgs.slice(0, idx);
    useEditorStore.getState().setCanvasChatMessages(kept);

    // 发送编辑后的消息
    sendMessage(newContent);
  }, [sendMessage]);

  // 手动停止当前生成请求
  const stopGeneration = useCallback(() => {
    setIsLoading(false);
    abortActiveRequest();
  }, []);

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
    stopGeneration,
    retryMessage,
    editAndSend,
    applyMessageOutput,
    handleClose,
    handleClearHistory,
    handleSelectModel: setChatModel,
    setChatResponseLang,
    canvasChatTargetSize,
    setCanvasChatTargetSize,
    // 系统提示词
    systemPrompts,
    activeCanvasChatSystemPromptId,
    // 预设
    chatPresets,
    selectedPresetId,
    selectedPreset,
    selectedBox,
    handleSelectPreset,
    refreshProviders,
    hasProviders: modelOptions.length > 0,
    handleRegenerate,
  };
}
