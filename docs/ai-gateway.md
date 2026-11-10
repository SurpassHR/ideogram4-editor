# Electron Desktop Application

Ideogram4 Editor is packaged as a single Electron application. The React
renderer, Node backend, and local storage all ship inside one installer; users
do not start a separate backend service.

## Runtime

```text
Ideogram4 Editor
├─ Electron main process
│  ├─ embedded Node HTTP backend
│  ├─ provider/ComfyUI proxy
│  ├─ workspace + asset storage
│  └─ safeStorage-backed provider keys
└─ BrowserWindow
   └─ React renderer
```

- Production uses a stable loopback origin on `127.0.0.1:47821` so renderer
  localStorage preferences survive restarts.
- Every launch creates a random API token. Preload exposes the API base URL and
  token to the renderer through `window.desktop`.
- `contextIsolation` is enabled, Node integration is disabled, and external
  navigation is blocked.
- The backend serves both the built renderer and `/v1/*` from the same origin in
  production. Development uses the Vite dev server with an explicit CORS origin.

## Data locations

Everything is rooted at Electron's `app.getPath('userData')/data`:

```text
workspace/canvas.json
workspace/chat.json
workspace/favorites.json
settings.json
providers.json
secrets.json
assets.json
assets/<asset id>
backups/auto-<timestamp>.zip
```

JSON writes are atomic. Provider API keys are encrypted through Electron
`safeStorage`; the renderer only receives `hasApiKey`. If secure storage is
unavailable, the backend refuses to persist a key.

## API

- `GET /v1/bootstrap`
- `GET/PUT /v1/settings`
- `GET /v1/providers`
- `PUT/DELETE /v1/providers/:id`
- `POST /v1/providers/:id/models/refresh`
- `POST /v1/chat`
- `POST /v1/chat/stream`
- `POST /v1/comfyui/prompt`
- `GET /v1/comfyui/history/:id`
- `GET /v1/comfyui/view`
- `PUT /v1/workspace/canvas`
- `PUT /v1/workspace/chat`
- `PUT /v1/workspace/favorites`
- `POST /v1/assets`
- `GET /v1/assets/:id`
- `GET/POST /v1/workspace/export`
- `POST /v1/workspace/import`

`/v1/chat/stream` emits normalized SSE events:

```text
event: thinking
event: content
event: done
event: error
```

## ComfyUI

ComfyUI is an external service. Configure an HTTP/HTTPS URL in the Generate
panel; the embedded backend proxies prompt submission, history polling, and
image retrieval. No localhost default is assumed and no extra ComfyUI auth is
supported in this version.

## Migration and backup

- The legacy Web version can export a `.zip` containing workspace JSON,
  IndexedDB images, presets/skills/local preferences, and provider metadata.
- API keys are deliberately omitted from migration bundles.
- The desktop first-run flow imports that bundle through the backend and asks
  the user to re-enter provider keys.
- Desktop workspace export/import uses the same versioned archive format and
  includes image assets plus localStorage preferences.
- GitHub Gist backup is hidden in the desktop Workspace panel.

## Development commands

```bash
npm run dev        # Electron + Vite development app
npm run build      # Type-check and build main/preload/renderer
npm run dist       # Package the current platform
npm run test       # Vitest unit/integration tests
npm run test:e2e   # Playwright Electron smoke test, hidden window
npm run dev:web    # Legacy web migration bridge only
npm run build:web  # Legacy web migration bridge build
```

Desktop packages are intentionally unsigned development builds. Signing,
notarization, and auto-update are not part of this version.
