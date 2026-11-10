# Optional AI Gateway

This is the first backend slice: a local-first LLM gateway that keeps provider
keys out of the browser and normalizes OpenAI, Anthropic, and Gemini streaming.
It does not change the existing static app until the frontend is explicitly
switched to the gateway.

The gateway requires Node.js 22.18+ because it runs the TypeScript sources
directly with Node's native type stripping. The static frontend still builds
with the repository's existing Node version requirement.

## Run

```bash
cp .env.example .env
# Fill in one or more provider API keys.
npm run gateway
```

Development mode:

```bash
npm run gateway:dev
```

The default bind address is `127.0.0.1:8787`. The gateway refuses to expose
API keys through `/v1/models`.

## Endpoints

### `GET /health`

```json
{ "ok": true }
```

### `GET /v1/models`

Returns public provider metadata only:

```json
{
  "providers": [
    { "id": "openai", "name": "OpenAI", "kind": "openai", "models": ["gpt-5.1"] }
  ]
}
```

### `POST /v1/chat`

Non-streaming request. When `AI_GATEWAY_TOKEN` is configured, send
`Authorization: Bearer <token>`.

```json
{
  "providerId": "openai",
  "model": "gpt-5.1",
  "systemPrompt": "Be concise.",
  "messages": [{ "role": "user", "content": "Describe a cat." }],
  "thinkingLevel": "off"
}
```

Response:

```json
{ "content": "A small feline...", "thinking": "" }
```

### `POST /v1/chat/stream`

Same request shape. Response is an SSE stream with normalized events:

```text
event: thinking
data: {"type":"thinking","text":"..."}

event: content
data: {"type":"content","text":"..."}

event: done
data: {"type":"done","text":"full content"}
```

On failure after headers are sent:

```text
event: error
data: {"type":"error","error":"..."}
```

## Configuration

- `AI_GATEWAY_HOST`, `AI_GATEWAY_PORT`: listener address. Default is loopback.
- `AI_GATEWAY_ALLOWED_ORIGINS`: comma-separated CORS origins.
- `AI_GATEWAY_TOKEN`: optional bearer token for `/v1/*`.
- `AI_GATEWAY_RATE_LIMIT_PER_MINUTE`: fixed-window per-client limit; default 60.
  Set to `0` only for controlled local testing.
- `AI_GATEWAY_MAX_BODY_BYTES`: request limit; default 25 MiB because base64
  reference images are supported.
- `AI_GATEWAY_REQUEST_TIMEOUT_MS`: upstream timeout; default 180 seconds.
- `AI_GATEWAY_PROVIDERS`: JSON array for custom providers; overrides built-ins
  with the same `id`.

## Security boundary

- Provider API keys remain in server environment variables.
- The browser never receives `apiKey` or private `baseUrl` values from this
  gateway.
- Requests with a disallowed browser `Origin` are rejected before any provider
  call. Chat requests must use `Content-Type: application/json`.
- When no token is configured, `/v1/*` is accepted only from loopback clients.
  A public bind address therefore requires `AI_GATEWAY_TOKEN`.
- Provider configuration rejects credential-bearing URLs, control characters in
  keys, and empty model allowlists. Upstream response bodies are not reflected
  in gateway errors.
- Bind to `127.0.0.1` for local use. A public deployment needs real user auth,
  production-grade rate limiting, request logging policy, and secret
  management; the optional static bearer token and in-memory limiter are only a
  development boundary.
- The gateway currently forwards prompts and optional reference images to the
  configured provider. This is not a local-only inference path.

## Next integration step

The frontend still uses the existing direct-provider path. A later task can
add a runtime gateway URL setting, map `/v1/models` into the existing provider
selector, and route `sendChatMessageWithOptions` through `/v1/chat/stream`
while preserving direct mode as a fallback.
