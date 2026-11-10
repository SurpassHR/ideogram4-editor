# Optional AI Gateway

This is the first backend slice: a **local-only** LLM gateway intended to become
the sidecar for a future desktop application. It keeps provider keys out of the
browser and normalizes OpenAI, Anthropic, and Gemini streaming. It does not
change the existing static app until the frontend is explicitly switched to the
gateway.

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

## Desktop packaging direction

The target topology is local-only:

```text
Electron main process
  ├─ starts the Node gateway on 127.0.0.1:<ephemeral-port>
  ├─ serves the built frontend and /v1 API from the same local origin
  ├─ stores provider keys in the OS keychain / Electron safeStorage
  └─ BrowserWindow loads http://127.0.0.1:<port>
```

Recommended packaging choices:

- Use Electron first. Its main process is already Node, so the gateway can run
  in-process or as a child process without packaging a second runtime.
- Bind to loopback only and let the OS choose an ephemeral port (`port: 0`).
  Pass the actual port to the renderer through the main process.
- Serve the production `dist/` and `/v1` API from the same origin. This removes
  CORS and custom-protocol edge cases from the packaged app.
- Move provider secrets from `.env` into the OS keychain / Electron
  `safeStorage` before shipping.
- Store canvas images in the app data directory instead of IndexedDB in desktop
  mode, while keeping IndexedDB as the browser fallback.
- Keep ComfyUI local (`127.0.0.1:8188`); the local sidecar can proxy it without
  browser CORS or HTTPS issues.
- Treat GitHub Gist backup as optional. A desktop app should default to local
  workspace files/zip exports, not cloud sync.

Cloud hosting, multi-user auth, and public rate-limit infrastructure are
explicit non-goals for this backend.

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
- Bind to `127.0.0.1`; public deployment is out of scope. The optional bearer
  token and in-memory limiter remain useful local defenses, especially because
  any local process can reach a loopback port.
- The gateway currently forwards prompts and optional reference images to the
  configured provider. This is not a local-only inference path.

## Next steps

1. Add a dynamic-port/per-launch-token startup path for the desktop main process.
2. Add an optional static-file mode so the packaged app can load `dist/` and the
   API from one origin.
3. Add a runtime gateway URL setting and map `/v1/models` into the existing
   provider selector.
4. Route `sendChatMessageWithOptions` through `/v1/chat/stream` while preserving
   direct mode as a fallback.
5. Add the Electron shell and move secrets/assets to desktop-native storage.
