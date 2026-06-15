export type ProviderKind = 'openai' | 'anthropic' | 'gemini' | 'openai_compat';

export interface LlmProvider {
  id: string;
  name: string;
  kind: ProviderKind;
  api_key: string;
  base_url: string;
  models: string[];
}

export const KIND_LABELS: Record<ProviderKind, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  openai_compat: 'OpenAI Compatible',
};

export const DEFAULT_BASE_URLS: Record<ProviderKind, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  openai_compat: '',
};

export function createEmptyProvider(): LlmProvider {
  return {
    id: '',
    name: '',
    kind: 'openai',
    api_key: '',
    base_url: '',
    models: [],
  };
}