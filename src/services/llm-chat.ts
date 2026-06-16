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

export function buildBoxChatSystemPrompt(box: Box, ctx: BoxChatContext): string {
  const modeLabel = box.mode === 'text' ? 'text' : 'object';
  const lines = [
    BOX_CHAT_SYSTEM_PROMPT,
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
    `Help the user improve the box's description for better image generation results. Provide concise, specific descriptions that work well within the overall composition. Respond in the same language the user uses. When suggesting descriptions, provide them in a clear format that can be directly adopted as the box description.`,
  ];
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

/** OpenAI / OpenAI Compatible 调用 */
async function callOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  apiMessages: { role: string; content: string }[],
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

  const data = await resp.json();
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error('No content in API response');
  }
  return choice.message.content;
}

/** Anthropic 调用 */
async function callAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  apiMessages: { role: string; content: string }[],
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

  const data = await resp.json();
  const block = data.content?.[0];
  if (!block?.text) {
    throw new Error('No content in API response');
  }
  return block.text;
}

/** Gemini 调用 */
async function callGemini(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  apiMessages: { role: string; content: string }[],
): Promise<string> {
  const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

  // Gemini 格式：systemInstruction + contents[]
  const contents = apiMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
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
): Promise<ChatResult> {
  const apiMessages = messagesToApiFormat(messages);
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
  apiMessages: { role: string; content: string }[],
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
