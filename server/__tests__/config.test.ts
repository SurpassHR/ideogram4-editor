// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadGatewayConfig } from '../config.ts';

describe('loadGatewayConfig', () => {
  it('uses safe loopback defaults when no providers are configured', () => {
    const config = loadGatewayConfig({});

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(8787);
    expect(config.allowedOrigins).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
    expect(config.providers).toEqual([]);
  });

  it('builds providers from common environment variables', () => {
    const config = loadGatewayConfig({
      OPENAI_API_KEY: 'openai-secret',
      OPENAI_MODELS: 'gpt-5.1, gpt-5.1-mini',
      ANTHROPIC_API_KEY: 'anthropic-secret',
      ANTHROPIC_MODELS: 'claude-sonnet-4-6',
      GEMINI_API_KEY: 'gemini-secret',
      GEMINI_MODELS: 'gemini-3.8-flash',
      OPENAI_COMPAT_ID: 'local-vllm',
      OPENAI_COMPAT_NAME: 'Local vLLM',
      OPENAI_COMPAT_BASE_URL: 'http://127.0.0.1:8000/v1',
      OPENAI_COMPAT_API_KEY: 'compat-secret',
      OPENAI_COMPAT_MODELS: 'qwen3-coder',
    });

    expect(config.providers).toEqual([
      {
        id: 'openai',
        name: 'OpenAI',
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'openai-secret',
        models: ['gpt-5.1', 'gpt-5.1-mini'],
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        kind: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'anthropic-secret',
        models: ['claude-sonnet-4-6'],
      },
      {
        id: 'gemini',
        name: 'Gemini',
        kind: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: 'gemini-secret',
        models: ['gemini-3.8-flash'],
      },
      {
        id: 'local-vllm',
        name: 'Local vLLM',
        kind: 'openai_compat',
        baseUrl: 'http://127.0.0.1:8000/v1',
        apiKey: 'compat-secret',
        models: ['qwen3-coder'],
      },
    ]);
  });

  it('applies JSON provider overrides and appends custom providers', () => {
    const config = loadGatewayConfig({
      OPENAI_API_KEY: 'env-secret',
      AI_GATEWAY_PROVIDERS: JSON.stringify([
        {
          id: 'openai',
          name: 'OpenAI Production',
          kind: 'openai',
          baseUrl: 'https://proxy.example.com/v1',
          apiKey: 'json-secret',
          models: ['gpt-5.1'],
        },
        {
          id: 'team-gateway',
          name: 'Team Gateway',
          kind: 'openai_compat',
          baseUrl: 'https://llm.example.com/v1',
          apiKey: 'team-secret',
          models: ['team-model'],
        },
      ]),
    });

    expect(config.providers.map(provider => provider.id)).toEqual(['openai', 'team-gateway']);
    expect(config.providers[0]).toMatchObject({
      name: 'OpenAI Production',
      baseUrl: 'https://proxy.example.com/v1',
      apiKey: 'json-secret',
    });
  });

  it('rejects malformed provider JSON and unsupported provider kinds', () => {
    expect(() => loadGatewayConfig({ AI_GATEWAY_PROVIDERS: '{not-json' }))
      .toThrow('AI_GATEWAY_PROVIDERS must be valid JSON');

    expect(() => loadGatewayConfig({
      AI_GATEWAY_PROVIDERS: JSON.stringify([{
        id: 'bad',
        name: 'Bad',
        kind: 'unknown',
        baseUrl: 'https://example.com',
        apiKey: 'secret',
        models: [],
      }]),
    })).toThrow('Unsupported provider kind: unknown');
  });

  it('reads network and limit settings from the environment', () => {
    const config = loadGatewayConfig({
      AI_GATEWAY_HOST: '0.0.0.0',
      AI_GATEWAY_PORT: '9001',
      AI_GATEWAY_ALLOWED_ORIGINS: 'https://editor.example.com, http://localhost:4173',
      AI_GATEWAY_TOKEN: 'gateway-token',
      AI_GATEWAY_MAX_BODY_BYTES: '4096',
      AI_GATEWAY_REQUEST_TIMEOUT_MS: '5000',
    });

    expect(config).toMatchObject({
      host: '0.0.0.0',
      port: 9001,
      allowedOrigins: ['https://editor.example.com', 'http://localhost:4173'],
      authToken: 'gateway-token',
      maxBodyBytes: 4096,
      requestTimeoutMs: 5000,
    });
  });
});
