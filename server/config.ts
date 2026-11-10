export interface GatewayProviderConfig {
  id: string;
  name: string;
  kind: 'openai' | 'anthropic' | 'gemini' | 'openai_compat';
  baseUrl: string;
  apiKey: string;
  models: string[];
}

export interface GatewayConfig {
  host: string;
  port: number;
  allowedOrigins: string[];
  authToken: string | null;
  maxBodyBytes: number;
  requestTimeoutMs: number;
  providers: GatewayProviderConfig[];
}

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function readList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function isProviderKind(value: unknown): value is GatewayProviderConfig['kind'] {
  return value === 'openai'
    || value === 'anthropic'
    || value === 'gemini'
    || value === 'openai_compat';
}

function parseJsonProviders(raw: string | undefined): GatewayProviderConfig[] {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('AI_GATEWAY_PROVIDERS must be valid JSON');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('AI_GATEWAY_PROVIDERS must be a JSON array');
  }
  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`AI_GATEWAY_PROVIDERS[${index}] must be an object`);
    }
    const value = item as Record<string, unknown>;
    if (!isProviderKind(value.kind)) {
      throw new Error(`Unsupported provider kind: ${String(value.kind)}`);
    }
    if (typeof value.id !== 'string' || !value.id.trim()) {
      throw new Error(`AI_GATEWAY_PROVIDERS[${index}].id is required`);
    }
    if (typeof value.name !== 'string' || !value.name.trim()) {
      throw new Error(`AI_GATEWAY_PROVIDERS[${index}].name is required`);
    }
    if (typeof value.baseUrl !== 'string' || !value.baseUrl.trim()) {
      throw new Error(`AI_GATEWAY_PROVIDERS[${index}].baseUrl is required`);
    }
    if (typeof value.apiKey !== 'string' || !value.apiKey.trim()) {
      throw new Error(`AI_GATEWAY_PROVIDERS[${index}].apiKey is required`);
    }
    if (!Array.isArray(value.models) || value.models.some(model => typeof model !== 'string')) {
      throw new Error(`AI_GATEWAY_PROVIDERS[${index}].models must be a string array`);
    }
    return {
      id: value.id.trim(),
      name: value.name.trim(),
      kind: value.kind,
      baseUrl: value.baseUrl.trim().replace(/\/$/, ''),
      apiKey: value.apiKey.trim(),
      models: value.models.map(model => model.trim()).filter(Boolean),
    };
  });
}

function mergeProviders(
  baseProviders: GatewayProviderConfig[],
  overrides: GatewayProviderConfig[],
): GatewayProviderConfig[] {
  const merged = [...baseProviders];
  for (const override of overrides) {
    const index = merged.findIndex(provider => provider.id === override.id);
    if (index >= 0) merged[index] = override;
    else merged.push(override);
  }
  return merged;
}

function providerFromEnv(
  env: NodeJS.ProcessEnv,
  options: {
    keyEnv: string;
    defaultId: string;
    defaultName: string;
    defaultBaseUrl: string;
    kind: GatewayProviderConfig['kind'];
    idEnv?: string;
    nameEnv?: string;
    baseUrlEnv: string;
    modelsEnv: string;
  },
): GatewayProviderConfig | null {
  const apiKey = env[options.keyEnv]?.trim();
  if (!apiKey) return null;
  const baseUrl = (env[options.baseUrlEnv]?.trim() || options.defaultBaseUrl).replace(/\/$/, '');
  return {
    id: (options.idEnv ? env[options.idEnv]?.trim() : '') || options.defaultId,
    name: (options.nameEnv ? env[options.nameEnv]?.trim() : '') || options.defaultName,
    kind: options.kind,
    baseUrl,
    apiKey,
    models: readList(env[options.modelsEnv]),
  };
}

export function loadGatewayConfig(env: NodeJS.ProcessEnv): GatewayConfig {
  const envProviders = [
    providerFromEnv(env, {
      keyEnv: 'OPENAI_API_KEY',
      defaultId: 'openai',
      defaultName: 'OpenAI',
      defaultBaseUrl: 'https://api.openai.com/v1',
      kind: 'openai',
      baseUrlEnv: 'OPENAI_BASE_URL',
      modelsEnv: 'OPENAI_MODELS',
    }),
    providerFromEnv(env, {
      keyEnv: 'ANTHROPIC_API_KEY',
      defaultId: 'anthropic',
      defaultName: 'Anthropic',
      defaultBaseUrl: 'https://api.anthropic.com/v1',
      kind: 'anthropic',
      baseUrlEnv: 'ANTHROPIC_BASE_URL',
      modelsEnv: 'ANTHROPIC_MODELS',
    }),
    providerFromEnv(env, {
      keyEnv: 'GEMINI_API_KEY',
      defaultId: 'gemini',
      defaultName: 'Gemini',
      defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      kind: 'gemini',
      baseUrlEnv: 'GEMINI_BASE_URL',
      modelsEnv: 'GEMINI_MODELS',
    }),
    providerFromEnv(env, {
      keyEnv: 'OPENAI_COMPAT_API_KEY',
      defaultId: 'openai_compat',
      defaultName: 'OpenAI Compatible',
      defaultBaseUrl: '',
      kind: 'openai_compat',
      idEnv: 'OPENAI_COMPAT_ID',
      nameEnv: 'OPENAI_COMPAT_NAME',
      baseUrlEnv: 'OPENAI_COMPAT_BASE_URL',
      modelsEnv: 'OPENAI_COMPAT_MODELS',
    }),
  ].filter((provider): provider is GatewayProviderConfig => provider !== null);

  const allowedOrigins = readList(env.AI_GATEWAY_ALLOWED_ORIGINS);
  const authToken = env.AI_GATEWAY_TOKEN?.trim() || null;

  return {
    host: env.AI_GATEWAY_HOST?.trim() || '127.0.0.1',
    port: readPositiveInt(env.AI_GATEWAY_PORT, 8787),
    allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : [...DEFAULT_ALLOWED_ORIGINS],
    authToken,
    maxBodyBytes: readPositiveInt(env.AI_GATEWAY_MAX_BODY_BYTES, 25 * 1024 * 1024),
    requestTimeoutMs: readPositiveInt(env.AI_GATEWAY_REQUEST_TIMEOUT_MS, 180_000),
    providers: mergeProviders(envProviders, parseJsonProviders(env.AI_GATEWAY_PROVIDERS)),
  };
}
