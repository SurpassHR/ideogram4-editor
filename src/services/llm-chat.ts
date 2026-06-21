/**
 * LLM 对话与优化服务 — 纯函数，无状态副作用。
 *
 * - sendChatMessage: 按 provider.kind 分发 API 调用，30s 超时，非流式
 * - optimizeText: 构造单轮对话，调用 sendChatMessage，返回 ChatResult
 * - OptimizeSelection 持久化：localStorage 存储/读取上次优化的 provider+model
 */

import type { LlmProvider } from '../components/llm/types';
import { DEFAULT_BASE_URLS } from '../components/llm/types';
import type { ChatMessage } from '../types/chat';
import { messagesToApiFormat } from '../types/chat';
import type { Box } from '../types';

// ─── 多模态辅助函数 ─────────────────────────────────────────────────

/** 从 Data URL 中提取 base64 数据部分 */
export function extractBase64FromDataUrl(dataUrl: string): string {
  return dataUrl.split(',')[1] || '';
}

/** 从 Data URL 中提取 MIME 类型（如 image/png） */
export function extractMimeTypeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);/);
  return match ? match[1] : 'image/png';
}

type MultimodalContentBlock = Record<string, unknown>;
type MultimodalApiMessage = {
  role: string;
  content: string | MultimodalContentBlock[];
  parts?: MultimodalContentBlock[];
};

/**
 * 为多模态图像参考构造 API 消息格式。
 * 将最后一条 user 消息转为多模态 content（含图像），其余消息保持原样。
 *
 * @param messages 原始消息列表（{role, content: string}）
 * @param imageDataUrl 可选的图像 Data URL
 * @param kind 提供商类型用于确定格式
 * @returns 格式化后的消息列表
 */
export function buildMultimodalMessages(
  messages: { role: string; content: string }[],
  imageDataUrl?: string,
  kind?: string,
): MultimodalApiMessage[] {
  if (!imageDataUrl) {
    return messages;
  }

  const base64 = extractBase64FromDataUrl(imageDataUrl);
  const mimeType = extractMimeTypeFromDataUrl(imageDataUrl);

  // 构建多模态 content（不含消息文本，由调用方决定文本内容）
  const buildImageContent = (text: string) => {
    if (kind === 'anthropic') {
      return [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text },
      ];
    }
    if (kind === 'gemini') {
      return [
        { inlineData: { mimeType, data: base64 } },
        { text },
      ];
    }
    // OpenAI / OpenAI Compatible（默认格式）
    return [
      { type: 'image_url', image_url: { url: imageDataUrl } },
      { type: 'text', text },
    ];
  };

  // 查找最后一条 user 消息的索引
  const lastUserIdx = findLastUserMessageIndex(messages);

  if (lastUserIdx < 0) {
    // 没有 user 消息，追加一条含图像的空 user 消息
    return [
      ...messages,
      { role: 'user', content: buildImageContent('') },
    ];
  }

  // 最后一条消息不是 user 时，追加一条多模态 user 消息
  if (lastUserIdx !== messages.length - 1) {
    return [
      ...messages,
      { role: 'user', content: buildImageContent('') },
    ];
  }

  // 最后一条是 user 消息，将其转为多模态
  return messages.map((msg, i) => {
    if (i !== lastUserIdx) return msg;
    return {
      role: msg.role,
      content: buildImageContent(msg.content),
    };
  });
}

/** 查找最后一条 user 消息的索引 */
function findLastUserMessageIndex(messages: { role: string }[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return i;
  }
  return -1;
}

// ─── System Prompt 常量 ────────────────────────────────────────────

/** AI 对话面板的系统提示词 */
export const BOX_CHAT_SYSTEM_PROMPT = `You are an expert prompt writer for the Ideogram 4 image generation model. The user is describing the content of a specific region in an image. Based on their description, generate a more detailed and precise English prompt suitable for direct use in Ideogram 4 image generation. Your response should include rich visual details (color, material, lighting, posture, scene details, etc.). The user may converse in Chinese or English, but your response must always be an English prompt.`;

/** AI 对话面板的上下文感知系统提示词构建 */
export interface BoxChatContext {
  highLevelDescription: string;
  aesthetics: string;
  lighting: string;
  medium: string;
  artStyle: string;
  background: string;
  globalPalette: string[];
  photoArtStyleMode: number;
}

export function buildBoxChatSystemPrompt(box: Box, ctx: BoxChatContext, responseLang?: string, customSystemPrompt?: string): string {
  const modeLabel = box.mode === 'text' ? 'text' : 'object';
  const basePrompt = customSystemPrompt || BOX_CHAT_SYSTEM_PROMPT;
  const lines = [
    basePrompt,
    '',
    `Current box properties:`,
    `- Mode: ${modeLabel}`,
    `- Text: ${box.text || '(empty)'}`,
    `- Description: ${box.desc || '(empty)'}`,
    `- Colors: ${box.colors.length > 0 ? box.colors.join(', ') : '(none)'}`,
    '',
    `Global composition context:`,
    `- High-level description: ${ctx.highLevelDescription || '(empty)'}`,
    `- Aesthetics: ${ctx.aesthetics || '(empty)'}`,
    `- Lighting: ${ctx.lighting || '(empty)'}`,
    `- Medium: ${ctx.medium || '(empty)'}`,
    `- Art style: ${ctx.artStyle || '(empty)'}`,
    `- Background: ${ctx.background || '(empty)'}`,
    `- Global color palette: ${ctx.globalPalette.length > 0 ? ctx.globalPalette.join(', ') : '(none)'}`,
    '',
    `Help the user improve the box's description for better image generation results. Provide concise, specific descriptions that work well within the overall composition.`,
  ];

  // LLM 回复语言偏好
  if (responseLang === 'en') {
    lines.push('Your response MUST be in English.');
  } else if (responseLang === 'zh') {
    lines.push('你的回复必须使用中文。');
  } else {
    lines.push('Respond in the same language the user uses.');
  }
  lines.push('When suggesting descriptions, provide them in a clear format that can be directly adopted as the box description.');

  // 有参考图时追加引导指令
  if (box.imageDataUrl && box.imageRole !== 'background') {
    lines.push('');
    lines.push('This box has a reference image attached. Use the visual content of the image to inform your prompt — describe what you see and how it relates to the user\'s text description.');
  }

  return lines.join('\n');
}

/** 各全局设置字段的优化提示词 */
export const OPTIMIZE_PROMPTS: Record<string, string> = {
  highLevelDescription: `You are an expert prompt writer for the Ideogram 4 image generation model. The user has written a high-level description of the image they want to create. Rewrite it with more vivid visual details, compositional hints, and mood cues. Output only the improved English description, nothing else.`,
  aesthetics: `You are an expert prompt writer for the Ideogram 4 image generation model. The user has written a brief aesthetics description. Transform it into a precise, evocative English aesthetics specification (e.g., "dreamy ethereal atmosphere with soft pastel tones and delicate bokeh overlays"). Output only the improved description, nothing else.`,
  lighting: `You are an expert prompt writer for the Ideogram 4 image generation model. The user has written a brief lighting description. Expand it into a detailed lighting scenario (e.g., "warm golden hour sunlight streaming through a stained glass window, casting multicolored shadows on the marble floor"). Output only the improved description, nothing else.`,
  medium: `You are an expert prompt writer for the Ideogram 4 image generation model. The user has written a brief medium description. Refine it into a precise medium specification (e.g., "high-resolution digital photograph shot on a Canon EOS R5 with a 85mm f/1.4 lens"). Output only the improved description, nothing else.`,
  artStyle: `You are an expert prompt writer for the Ideogram 4 image generation model. The user has written a brief art style description. Expand it into a rich art style specification (e.g., "impressionist oil painting style with visible brushstrokes, influenced by Claude Monet's water lilies series"). Output only the improved description, nothing else.`,
  background: `You are an expert prompt writer for the Ideogram 4 image generation model. The user has written a brief background description. Expand it into a detailed environment description with atmosphere and depth (e.g., "a serene misty forest clearing with towering ancient oaks, moss-covered stones, and a gentle stream winding through fern-lined banks"). Output only the improved description, nothing else.`,
};

const DEFAULT_OPTIMIZE_PROMPT =
  'You are an expert prompt writer for the Ideogram 4 image generation model. Optimize the following text to be more vivid, specific, and descriptive. Output only the improved text, nothing else.';

// ─── 通用返回结构 ──────────────────────────────────────────────────

export interface ChatResult {
  ok: boolean;
  content?: string;
  error?: string;
}

const TIMEOUT_MS = 30_000;

function timeoutPromise(): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timeout (30s)')), TIMEOUT_MS),
  );
}

// ─── Provider 分发 ─────────────────────────────────────────────────

/** 解析 OpenAI 响应：自动检测 SSE 流式格式或普通 JSON 格式 */
export function parseOpenAIResponse(text: string): string {
  if (text.trimStart().startsWith('data: ')) {
    // SSE 流式格式
    const lines = text.split('\n');
    let content = '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6); // 去掉 "data: " 前缀
      if (jsonStr === '[DONE]') continue;
      try {
        const chunk = JSON.parse(jsonStr);
        const deltaContent = chunk.choices?.[0]?.delta?.content;
        if (deltaContent) {
          content += deltaContent;
        }
      } catch {
        // 跳过无法解析的行
      }
    }
    if (!content) {
      throw new Error('No content in API response');
    }
    return content;
  }

  // 普通 JSON 格式
  const data = JSON.parse(text);
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error('No content in API response');
  }
  return choice.message.content;
}

/** 解析 Anthropic 响应：自动检测 SSE 流式格式或普通 JSON 格式 */
export function parseAnthropicResponse(text: string): string {
  if (text.trimStart().startsWith('data: ')) {
    // SSE 流式格式
    const lines = text.split('\n');
    let content = '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6); // 去掉 "data: " 前缀
      if (jsonStr === '[DONE]') continue;
      try {
        const event = JSON.parse(jsonStr);
        if (event.type === 'content_block_delta' && event.delta?.text) {
          content += event.delta.text;
        }
      } catch {
        // 跳过无法解析的行
      }
    }
    if (!content) {
      throw new Error('No content in API response');
    }
    return content;
  }

  // 普通 JSON 格式
  const data = JSON.parse(text);
  const block = data.content?.[0];
  if (!block?.text) {
    throw new Error('No content in API response');
  }
  return block.text;
}

/** OpenAI / OpenAI Compatible 调用 */
async function callOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  apiMessages: { role: string; content: string | Record<string, unknown>[] }[],
): Promise<string> {
  const url = `${baseUrl}/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: apiMessages,
      stream: false,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const text = await resp.text();
  return parseOpenAIResponse(text);
}

/** Anthropic 调用 */
async function callAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  apiMessages: { role: string; content: string | Record<string, unknown>[] }[],
): Promise<string> {
  const url = `${baseUrl}/messages`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: apiMessages,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const text = await resp.text();
  return parseAnthropicResponse(text);
}

/** Gemini 调用 */
async function callGemini(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  apiMessages: { role: string; content: string | Record<string, unknown>[] }[],
): Promise<string> {
  const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

  // Gemini 格式：systemInstruction + contents[]
  const contents = apiMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: Array.isArray(m.content) ? m.content : [{ text: m.content }],
  }));

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  const candidate = data.candidates?.[0];
  const part = candidate?.content?.parts?.[0];
  if (!part?.text) {
    throw new Error('No content in API response');
  }
  return part.text;
}

// ─── 核心 API ──────────────────────────────────────────────────────

/**
 * 发送对话消息到 LLM，按 provider.kind 自动分发。
 * 非流式，30s 超时。
 */
export async function sendChatMessage(
  provider: LlmProvider,
  model: string,
  messages: ChatMessage[],
  systemPrompt: string,
  imageDataUrl?: string,
): Promise<ChatResult> {
  const rawApiMessages = messagesToApiFormat(messages);
  // 当有参考图时，构造多模态消息格式
  const apiMessages = imageDataUrl
    ? buildMultimodalMessages(rawApiMessages, imageDataUrl, provider.kind)
    : rawApiMessages;
  const baseUrl = provider.base_url || DEFAULT_BASE_URLS[provider.kind];

  try {
    const content = await Promise.race([
      dispatchCall(provider.kind, baseUrl, provider.api_key, model, systemPrompt, apiMessages),
      timeoutPromise(),
    ]);
    return { ok: true, content };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/** 按 provider.kind 分发到对应的 API 调用 */
function dispatchCall(
  kind: string,
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  apiMessages: { role: string; content: string | Record<string, unknown>[] }[],
): Promise<string> {
  switch (kind) {
    case 'openai':
    case 'openai_compat':
      // OpenAI 格式：system 拼到 messages 队首
      return callOpenAI(
        baseUrl,
        apiKey,
        model,
        [{ role: 'system', content: systemPrompt }, ...apiMessages],
      );
    case 'anthropic':
      return callAnthropic(baseUrl, apiKey, model, systemPrompt, apiMessages);
    case 'gemini':
      return callGemini(baseUrl, apiKey, model, systemPrompt, apiMessages);
    default:
      throw new Error(`Unknown provider kind: ${kind}`);
  }
}

/**
 * 优化全局设置文本 — 内部构造单轮对话调用 sendChatMessage。
 * fieldKey 用于选取 OPTIMIZE_PROMPTS 中对应的系统提示词。
 */
export async function optimizeText(
  provider: LlmProvider,
  model: string,
  currentText: string,
  fieldKey: string,
): Promise<ChatResult> {
  const systemPrompt = OPTIMIZE_PROMPTS[fieldKey] || DEFAULT_OPTIMIZE_PROMPT;

  const messages: ChatMessage[] = [
    {
      id: `opt_${Date.now()}`,
      role: 'user',
      content: currentText,
      timestamp: Date.now(),
    },
  ];

  return sendChatMessage(provider, model, messages, systemPrompt);
}

// ─── 持久化上次优化使用的 provider+model ────────────────────────────

const OPTIMIZE_STORAGE_KEY = 'ideogram4-optimize-provider';

export interface OptimizeSelection {
  providerId: string;
  model: string;
}

export function loadOptimizeSelection(): OptimizeSelection | null {
  try {
    const raw = localStorage.getItem(OPTIMIZE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveOptimizeSelection(selection: OptimizeSelection): void {
  localStorage.setItem(OPTIMIZE_STORAGE_KEY, JSON.stringify(selection));
}
