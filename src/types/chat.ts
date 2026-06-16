/** AI 对话与优化功能的消息类型定义 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** 标记此 assistant 回复是否已被用户采纳并写入 box */
  adopted?: boolean;
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
