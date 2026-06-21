/** AI 对话与优化功能的消息类型定义 */

import type { IdeogramOutput } from './index';
import type { LayoutQualityReport } from '../services/layout-validator';

/** Chat 请求的显式思考强度设置 */
export type ChatThinkingLevel = 'off' | 'low' | 'medium' | 'high';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** 标记此 assistant 回复是否已被用户采纳并写入 box（per-box ChatPanel 使用） */
  adopted?: boolean;
  /** Canvas Chat 中使用：该消息的 JSON 构图是否已被应用到画布（仅 assistant 消息） */
  applied?: boolean;
  /** 模型推理过程文本，从流式事件中提取 */
  thinking?: string;
  /** 消息发送时刻的画布截图 Data URL（仅 Canvas Chat 使用） */
  canvasSnapshotUrl?: string;
}

/** Canvas Chat 的单个会话，后续可直接持久化到 localStorage */
export interface CanvasChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  pendingIdeogramOutput: IdeogramOutput | null;
  pendingQualityReport: LayoutQualityReport | null;
  requestLogs: CanvasChatRequestLog[];
}

/** Canvas Chat 的一次请求日志 */
export interface CanvasChatRequestLog {
  id: string;
  sessionId: string;
  promptPreview: string;
  status: 'running' | 'success' | 'error';
  startedAt: number;
  endedAt?: number;
  steps: CanvasChatRequestLogStep[];
  detail?: CanvasChatRequestLogDetail;
}

/** Canvas Chat 单次请求的完整调试详情 */
export interface CanvasChatRequestLogDetail {
  metadata?: {
    providerId: string;
    providerName: string;
    modelName: string;
    responseLang: string;
    streamEnabled: boolean;
    thinkingLevel: ChatThinkingLevel;
    targetSize: number;
    canvasSize: { width: number; height: number };
    boxCount: number;
  };
  systemPrompt?: string;
  messages?: ChatMessageForApi[];
  responseText?: string;
  parsedJsonText?: string;
  parseError?: string;
}

/** Canvas Chat 请求日志中的单个步骤 */
export interface CanvasChatRequestLogStep {
  id: string;
  at: number;
  kind:
    | 'snapshot'
    | 'build_context'
    | 'provider_ready'
    | 'stream_start'
    | 'stream_chunk'
    | 'stream_done'
    | 'parse_success'
    | 'parse_failed'
    | 'layout_validation'
    | 'done'
    | 'error';
  status: 'pending' | 'running' | 'success' | 'error';
  label: string;
  detail?: string;
}

/** 系统提示词条目 */
export interface SystemPromptEntry {
  id: string;
  name: string;
  content: string;
  /** 适用范围：canvas（Canvas Chat）、box（Per-Box Chat）、both（两者） */
  scope: 'canvas' | 'box' | 'both';
  createdAt: number;
  updatedAt: number;
}

/** 生成唯一消息 ID：`msg_<timestamp>_<随机4位>` */
export function generateMessageId(): string {
  const hex = Math.random().toString(16).slice(2, 6);
  return `msg_${Date.now()}_${hex}`;
}

/** 创建一条用户消息 */
export function createUserMessage(content: string): ChatMessage {
  return {
    id: generateMessageId(),
    role: 'user',
    content,
    timestamp: Date.now(),
  };
}

/** 创建一条 assistant 消息 */
export function createAssistantMessage(content: string): ChatMessage {
  return {
    id: generateMessageId(),
    role: 'assistant',
    content,
    timestamp: Date.now(),
  };
}

/** 仅保留对话所需字段的精简结构，用于发送给 LLM API */
export interface ChatMessageForApi {
  role: 'user' | 'assistant';
  content: string;
}

/** 将 ChatMessage[] 转换为 API 发送格式（去除 id/timestamp/adopted） */
export function messagesToApiFormat(messages: ChatMessage[]): ChatMessageForApi[] {
  return messages.map(m => ({ role: m.role, content: m.content }));
}
