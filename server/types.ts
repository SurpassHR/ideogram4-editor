export type GatewayProviderKind = 'openai' | 'anthropic' | 'gemini' | 'openai_compat';

export type GatewayThinkingLevel = 'off' | 'low' | 'medium' | 'high';

export interface GatewayChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GatewayChatRequest {
  providerId: string;
  model: string;
  messages: GatewayChatMessage[];
  systemPrompt?: string;
  imageDataUrl?: string;
  thinkingLevel?: GatewayThinkingLevel;
}

export type GatewayStreamEvent =
  | { type: 'thinking'; text: string }
  | { type: 'content'; text: string }
  | { type: 'done'; text: string }
  | { type: 'error'; error: string };

export interface GatewayChatResult {
  content: string;
  thinking: string;
}
