# Ideogram4 Editor

> A visual JSON prompt builder for the Ideogram 4 image generation model. Drag bounding boxes on a canvas, configure descriptions and colors, generate structured JSON prompts, and render images via ComfyUI.

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![React](https://img.shields.io/badge/React-19-61dafb.svg)
![Vite](https://img.shields.io/badge/Vite-7-646cff.svg)
![Zustand](https://img.shields.io/badge/Zustand-5-orange.svg)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

[**中文文档**](./README.zh.md) · [Report Bug](https://github.com/SurpassHR/ideogram4-editor/issues) · [Request Feature](https://github.com/SurpassHR/ideogram4-editor/issues)

---

## Overview

Ideogram4 Editor is a web-based visual tool for crafting structured JSON prompts for the [Ideogram 4](https://ideogram.ai/) image generation model. Instead of writing complex JSON by hand, you interact with a canvas to define image regions, configure visual properties, and generate standardized prompts — all with real-time visual feedback.

**Core workflow:** Drag to create bounding boxes on a canvas → Configure each box (mode, text, description, colors) → Set global parameters (aesthetics, lighting, medium) → Generate normalized JSON prompt → Render via ComfyUI API.

---

## Features

- 🖊️ **Canvas Interaction** — Drag to create, move, and resize bounding boxes with pixel-precise positioning
- 🔍 **Artboard Controls** — Scroll-wheel zoom (centered on cursor), middle-button pan, 10%–500% zoom range
- 🎨 **Color Palettes** — Global palette (up to 16 colors) + per-box independent palette
- 📝 **Dual Mode** — Photo mode (`MODE_PHOTO`) and Art Style mode (`MODE_ARTSTYLE`); each box can be `obj` or `text`
- 🌐 **i18n** — Built-in Chinese/English interface with persistent language preference
- 📋 **JSON Generation / Loading** — One-click JSON export, paste to import existing prompts
- 🖼️ **Image Drag & Drop** — Import PNG backgrounds; auto-extract embedded ComfyUI metadata
- 🔌 **ComfyUI Integration** — Direct API calls for image generation with seed control and quality presets
- 🤖 **LLM Assistance** — Multi-provider support (OpenAI, Anthropic, Gemini, OpenAI-compatible) for AI-powered prompt optimization
- 💬 **AI Chat Panels** — Per-box AI chat (✨ button) and canvas-level composition chat with streaming SSE output
- 🧠 **Chain of Thought** — Auto-detects and displays model reasoning in collapsible blocks
- 🖼️ **Canvas Snapshots** — Each AI reply includes a canvas thumbnail from the moment of sending
- 🎭 **Dark Theme** — Custom CSS-driven design system with zero external UI libraries
- ⌨️ **Keyboard Shortcuts** — `Ctrl+D/X/C/V` for box operations, `Delete` to remove
- ⚡ **SSE Streaming** — Token-by-token streaming for all LLM interactions
- ✨ **Interactive Glow Grid** — Dynamic dot-matrix glow background via CSS Masking + JS coordinate mapping

---

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server (default http://localhost:5173)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

### Basic Workflow

1. **Set canvas size** — Use the ratio dropdown and scale slider (1×–16×) in the floating toolbar above the canvas. Base unit is 256px, range 256–4096px.
2. **Create bounding boxes** — Drag on the canvas to draw rectangles. Each box represents a region in the final image.
3. **Configure box properties** — Click a box to select it, then use the right panel (Box tab):
   - **Mode**: `obj` (object/photo) or `text` (text/art style)
   - **Text**: Label displayed inside the box
   - **Description**: Detailed visual description for this region
   - **Colors**: Assign colors (max 5 per box); same-colored boxes are treated as parts of the same object
4. **Configure global settings** — Switch to the "Global" tab in the right panel: style mode, description, aesthetics, lighting, medium, and global palette
5. **Generate JSON** — Click "Generate JSON" to normalize box coordinates to 0–1000 and produce a standardized prompt
6. **Copy / Load** — Copy the JSON to clipboard, or paste JSON to load into the editor

### Advanced Operations

| Action | Method |
|--------|--------|
| Inline edit box text | Double-click box → type → Enter (save) / Escape (cancel) |
| AI chat optimization | Select box → click ✨ button → chat with LLM (configure providers in `/#/settings`) |
| Box reference image | Drag & drop or paste an image onto a box as visual reference |
| Canvas background | Right-click canvas → "Import Background Image" |
| Box operations | Right-click box → duplicate/cut/copy/delete/layer/image/AI Chat |
| Artboard controls | Scroll to zoom · Middle-click to pan · Bottom slider (10%–500%) |
| PNG metadata import | Drag a ComfyUI-generated PNG → auto-extract embedded prompt |

### Image Generation (local ComfyUI required)

1. Run ComfyUI at `http://localhost:8188` (editable in the UI)
2. Install required models (see [ComfyUI Setup](#comfyui-setup))
3. Configure boxes and global settings → set seed → click "Generate"
4. The editor injects the workflow → POST `/api/prompt` → polls `/history/{id}` → displays the result

---

## Tech Stack

| Category | Technology | Version |
|----------|-----------|---------|
| UI Framework | React | 19 |
| Type System | TypeScript | 5.9 |
| Build Tool | Vite | 7 |
| State Management | Zustand | 5 |
| Styling | Tailwind CSS | v4 |
| UI Components | Custom-built | Zero external UI libs |
| Image Generation | ComfyUI API | `/api/prompt` + `/history/{id}` |
| Internationalization | React Context | Custom i18n system |

---

## Project Structure

```
src/
├── main.tsx                              # Entry point: App + I18nProvider
├── index.css                             # Tailwind + CSS variables + global styles
├── i18n/
│   ├── context.tsx                       # I18nProvider + useI18n() hook
│   └── translations.ts                   # Chinese/English dictionaries (~120 entries)
├── store/
│   └── index.ts                          # Zustand store (useEditorStore), single source of truth
├── types/
│   ├── index.ts                          # Box, IdeogramOutput, GenerationStatus, etc.
│   ├── chat.ts                           # ChatMessage types
│   ├── presets.ts                        # PromptPreset interface
│   └── workspace.ts                      # Backup/restore types
├── hooks/
│   ├── usePointerInteraction.ts          # Canvas pointer events: draw/drag/resize boxes
│   ├── useImageDrop.ts                   # Image drag-and-drop import, PNG metadata extraction
│   ├── useBoxImageImport.ts              # Box image import: drag/upload/paste
│   ├── useComfyUIGeneration.ts           # ComfyUI generation flow orchestration
│   ├── useArtboardZoom.ts                # Artboard zoom/pan: wheel zoom + middle-click pan
│   ├── useChatPanel.ts                   # Per-box AI chat panel logic
│   ├── useCanvasChat.ts                  # Canvas-level AI composition chat
│   └── useHashRoute.ts                   # Hash-based routing hook
├── components/
│   ├── layout/                           # App shell: Header, MainContent, SettingsPage, BottomBar
│   ├── canvas/                           # Artboard, CanvasArea, BoundingBox, ContextMenu, etc.
│   ├── panels/                           # GlobalSettings, BoxProperties, RightPanelContainer
│   ├── json/                             # JSON generation/loading toolbar
│   ├── comfyui/                          # Generation controls + image preview
│   ├── llm/                              # LLM provider management + config panel
│   ├── chat/                             # Chat panels, messages, preset manager, SelectMenu
│   └── shortcuts/                        # Keyboard shortcuts modal
├── utils/                                # Coordinates, JSON serialization, highlighting, etc.
├── services/                             # LLM API calls, streaming, canvas chat, layout validation, backup
└── workflow/                             # ComfyUI workflow template + mutator
```

---

## Architecture

### Data Flow

```
User drags on canvas (Pointer Events → usePointerInteraction)
        ↓
Canvas renders boxes (Artboard → CanvasArea → BoundingBox)
        ↓
Store updates boxes[] (Zustand useEditorStore)
        ↓
Configure global settings + box properties (GlobalSettingsPanel + BoxPropertiesPanel)
        ↓
generateJSON() normalizes coordinates to 0–1000, merges global settings
        ↓
Outputs standardized JSON prompt (IdeogramOutput structure)
        ↓
buildWorkflowPayload() injects into ComfyUI workflow template
        ↓
POST /api/prompt → poll /history/{id} → display generated image
```

### Coordinate System

| Level | Range | Description |
|-------|-------|-------------|
| **Canvas** | `canvasW × canvasH` px | Actual pixel position and size of bounding boxes |
| **Artboard** | Screen pixels + zoom/pan offset | `screenToCanvas(sx, sy) = (sx - rect.left - panX) / zoom` |
| **JSON** | 0–1000 integers | Normalized output: `Math.round((val / max) * 1000)` |

### Key Store Fields

| Field | Default | Description |
|-------|---------|-------------|
| `canvasW / canvasH` | `1024 / 1024` | Canvas dimensions (256–4096) |
| `boxes[]` | `[]` | Array of all bounding box states |
| `selectedBoxId` | `null` | Currently selected box ID |
| `globalPalette[]` | `[]` | Global color palette (max 16 colors) |
| `photoArtStyleMode` | `1` (Art Style) | Photo mode (0) or Art Style mode (1) |
| `apiUrl` | `http://localhost:8188` | ComfyUI API address |
| `generationStatus` | `'idle'` | `idle \| generating \| polling \| done \| error` |
| `isCanvasChatMaximized` | `false` | Whether Canvas Chat is in full-screen mode |
| `chatThinkingLevel` | `'medium'` | LLM reasoning effort: `off \| low \| medium \| high` |

---

## ComfyUI Setup

### Required Models

Place these in your ComfyUI `models/` directory:

| Model File | Directory | Purpose |
|------------|-----------|---------|
| `ideogram4_fp8_scaled.safetensors` | `models/diffusion_models/` | Main diffusion model |
| `ideogram4_unconditional_fp8_scaled.safetensors` | `models/diffusion_models/` | Unconditional model (dual-model CFG) |
| `qwen3vl_8b_fp8_scaled.safetensors` | `models/text_encoders/` | CLIP text encoder |

### Generation Flow

1. Configure boxes and prompt in the editor
2. Click "Generate Image"
3. Editor injects JSON into workflow → POST to `/api/prompt`
4. Polls `/history/{prompt_id}` every 3 seconds (5 min timeout)
5. Displays the result image

---

## LLM Configuration

Configure providers at `/#/settings` → LLM Providers panel.

### Supported Providers

| Provider | Kind | Notes |
|----------|------|-------|
| OpenAI | `openai` | GPT series |
| Anthropic | `anthropic` | Claude series |
| Google Gemini | `gemini` | Gemini series |
| OpenAI-compatible | `openai_compat` | Any OpenAI-compatible API (Ollama, vLLM, Grok, DeepSeek, etc.) |

### AI Chat Features

- **Multimodal support**: Reference images can be sent as multimodal input (OpenAI/Anthropic/Gemini formats)
- **Prompt presets**: 4 built-in templates with variable substitution (`{box_text}`, `{box_desc}`, `{box_colors}`, `{box_mode}`)
- **Response language**: Auto/English/Chinese
- **Streaming**: SSE token-by-token output for both per-box and canvas chat
- **Chain of Thought**: Model reasoning displayed in collapsible blocks

### Output Formats

**Per-Box Chat** (individual box → ✨ button): Returns free text adopted as the box's `desc` field.

**Canvas Chat** (canvas-level composition): Returns a structured `IdeogramOutput` JSON wrapped in a ```json code block with:
- `high_level_description` — Scene overview
- `style_description` — Aesthetics, lighting, palette, medium, art style/photo
- `compositional_deconstruction` — Background + elements array (type, bbox, desc, text, colors)

---

## Development

### Design Tokens

```css
:root {
  --bg: #0d0d1a;           /* Main background */
  --surface: #161630;       /* Card/panel background */
  --surface-raised: #1e1e3a;/* Raised surface */
  --primary: #7c5cfc;       /* Primary color */
  --primary-hover: #9575fd; /* Primary hover */
  --accent: #00d4aa;        /* Accent color */
  --danger: #ff5252;        /* Danger color */
  --text: #e8e8f0;          /* Primary text */
  --text-secondary: #8888aa;/* Secondary text */
  --text-muted: #5a5a7a;    /* Muted text */
}
```

### i18n

- Translations: `src/i18n/translations.ts`, organized by UI section
- Usage: `t('section.key', { var: value })` — dot-notation path + `{var}` interpolation
- Adding a language: Add entries to the `Translations` interface and populate both `en` and `zh` objects

### Commands

```bash
npm run dev       # Start dev server
npx tsc -b        # TypeScript type check
npm run build     # Production build
npm run test      # Run test suite (Vitest)
npm run preview   # Preview production build
```

---

## License

[MIT](./LICENSE)
