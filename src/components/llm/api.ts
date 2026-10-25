import type { LlmProvider, ProviderKind } from './types';
import { DEFAULT_BASE_URLS } from './types';

export const LLM_PROVIDERS_STORAGE_KEY = 'ideogram4-llm-providers';

function load(): LlmProvider[] {
  try {
    const raw = localStorage.getItem(LLM_PROVIDERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(providers: LlmProvider[]): void {
  localStorage.setItem(LLM_PROVIDERS_STORAGE_KEY, JSON.stringify(providers));
}

export const MOCK_TEST_PROVIDER: LlmProvider = {
  id: 'mock_test_provider',
  name: 'Mock Test Provider',
  kind: 'openai',
  api_key: 'mock-key',
  base_url: 'https://api.mock.test/v1',
  models: ['mock-gpt-4o', 'mock-claude-3-7-thinking'],
};

export async function getLlmProviders(): Promise<LlmProvider[]> {
  const providers = load();
  try {
    if (localStorage.getItem("ideogram4-mock-test-mode") === "true") {
      return [MOCK_TEST_PROVIDER, ...providers];
    }
  } catch {}
  return providers;
}

export async function saveLlmProvider(provider: LlmProvider): Promise<void> {
  const providers = load();
  const idx = providers.findIndex(p => p.id === provider.id);
  if (idx >= 0) {
    providers[idx] = provider;
  } else {
    providers.push(provider);
  }
  save(providers);
}

export async function deleteLlmProvider(id: string): Promise<void> {
  const providers = load().filter(p => p.id !== id);
  save(providers);
}

export async function replaceLlmProviders(providers: LlmProvider[]): Promise<void> {
  save(providers);
}

export async function fetchModels(kind: ProviderKind, baseUrl: string, apiKey: string): Promise<string[]> {
  const url = baseUrl || DEFAULT_BASE_URLS[kind];

  switch (kind) {
    case 'openai':
    case 'openai_compat': {
      const resp = await fetch(`${url}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!resp.ok) throw new Error(`Failed to fetch models: ${resp.status}`);
      const data = await resp.json();
      return (data.data || []).map((m: { id: string }) => m.id).sort();
    }
    case 'anthropic': {
      const resp = await fetch(`${url}/models`, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      });
      if (!resp.ok) throw new Error(`Failed to fetch models: ${resp.status}`);
      const data = await resp.json();
      return (data.data || []).map((m: { id: string }) => m.id).sort();
    }
    case 'gemini': {
      const resp = await fetch(`${url}/models?key=${apiKey}`);
      if (!resp.ok) throw new Error(`Failed to fetch models: ${resp.status}`);
      const data = await resp.json();
      return (data.models || [])
        .filter((m: { supportedGenerationMethods?: string[] }) =>
          m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: { name: string }) => m.name.replace(/^models\//, ''))
        .sort();
    }
    default:
      throw new Error(`Unknown provider kind: ${kind}`);
  }
}
