/** AI 对话与优化功能的消息类型定义 */

import type { IdeogramOutput } from './index';
import type { LayoutQualityReport } from '../services/layout-validator';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** 标记此 assistant 回复是否已被用户采纳并写入 box */
  adopted?: boolean;
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
