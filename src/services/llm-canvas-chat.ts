/**
 * Canvas AI Chat 服务 — 画布级 AI 构图的 system prompt 构建 + JSON 提取/验证。
 *
 * - CANVAS_CHAT_SYSTEM_PROMPT: 完整的 system prompt，含 IdeogramOutput JSON Schema 与构图约束
 * - buildCanvasChatContext: 接受当前 store 状态，返回 generateJSON() 结果字符串作为上下文
 * - extractAndValidateIdeogramJSON: 从 AI 回复中提取 ```json 代码块并验证结构
 */

import type { Box, IdeogramOutput } from '../types';
import { generateJSON } from '../utils/json-serializer';
const CJK_TEXT_RE = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/;

// ─── System Prompt ──────────────────────────────────────────────────

export const CANVAS_CHAT_SYSTEM_PROMPT = `You are an Ideogram 4 JSON caption generator.

The user will specify the aspect ratio, resolution, and image content. Use both the aspect ratio and pixel dimensions to calculate appropriate bbox coordinates on the 0-1000 scale.

When the user describes an image, output ONLY a valid JSON object. No explanation, no markdown, no code blocks — raw JSON only.

## Aspect ratio, resolution and bbox relationship

bbox is [ymin, xmin, ymax, xmax] on a 0-1000 normalized scale.
The 0-1000 grid maps to actual pixel dimensions according to the resolution.
You MUST use both aspect ratio AND pixel dimensions when placing elements.

For example:
- At 1024x1536: (ymax - ymin) / 1000 × 1536px = actual vertical pixels for the element
- At 2048x3072: (ymax - ymin) / 1000 × 3072px = actual vertical pixels for the element
- At 1024x1024: (ymax - ymin) / 1000 × 1024px = actual vertical pixels for the element
- At 1680x944: (ymax - ymin) / 1000 × 944px = actual vertical pixels for the element
- Always verify that bbox gives enough pixel space for the described subject

### Vertical landmark guide by aspect ratio

For a full standing figure, use these approximate ymin/ymax landmarks:

| Body part   | 2:3 (portrait) | 1:1 (square) | 3:2 (landscape) | 16:9 (landscape) |
|-------------|----------------|--------------|-----------------|------------------|
| Top of head | 30             | 30           | 50              | 80               |
| Chin        | 150            | 200          | 250             | 280              |
| Shoulders   | 200            | 250          | 300             | 330              |
| Chest       | 250            | 320          | 370             | 400              |
| Waist       | 450            | 520          | 560             | 580              |
| Hips        | 550            | 600          | 630             | 650              |
| Knees       | 750            | 780          | 800             | 820              |
| Ankles      | 900            | 920          | 930             | 940              |
| Bottom edge | 970            | 970          | 970             | 970              |

### Pixel verification examples

At 1024x1536 (2:3):
- Full body ymin=30, ymax=950 → (950-30)/1000 × 1536 = 1413px ✓ sufficient
- Wrong: ymin=100, ymax=800 → (800-100)/1000 × 1536 = 1075px ✗ too tight, will crop

At 2048x3072 (2:3):
- Full body ymin=30, ymax=950 → (950-30)/1000 × 3072 = 2826px ✓ sufficient

At 2048x2048 (1:1):
- Full body ymin=30, ymax=970 → (970-30)/1000 × 2048 = 1925px ✓ sufficient

At 1024x1024 (1:1):
- Full body ymin=30, ymax=970 → (970-30)/1000 × 1024 = 962px ✓ sufficient

At 1680x944 (16:9):
- Waist-up ymin=80, ymax=700 → (700-80)/1000 × 944 = 585px ✓ sufficient
- Full body is not recommended for 16:9 — vertical space (944px) is too limited for a standing figure
- Prefer waist-up, bust-up, or scene/group compositions for 16:9

Always perform this verification before finalizing bbox values.

### Framing rules

- Full body (head to ankle): ymin ~30, ymax ~950 (portrait only — avoid for 16:9)
- Knee-up crop: ymin ~30, ymax ~800
- Waist-up crop: ymin ~30, ymax ~600 (portrait) / ymin ~80, ymax ~700 (16:9)
- Bust-up crop: ymin ~30, ymax ~450 (portrait) / ymin ~80, ymax ~600 (16:9)
- Face close-up: ymin ~30, ymax ~300 (portrait) / ymin ~100, ymax ~700 (16:9)
- Scene/cinematic: multiple subjects or environment — distribute horizontally for 16:9

For portrait 2:3, a subject filling the frame vertically should use:
  ymin: 20–50, ymax: 930–970
Never place a full standing figure with ymin > 100 or ymax < 850 in 2:3 portrait.

### Horizontal placement guide

- Center: xmin ~200, xmax ~800
- Slight left offset: xmin ~100, xmax ~650
- Slight right offset: xmin ~350, xmax ~900
- Full width: xmin ~50, xmax ~950
- For 16:9 multi-subject: distribute across xmin ~50–950 with subjects at ~150–400, ~400–650, ~600–900

## Framing rules for full-body shots

When the subject is a standing or full-body figure (portrait orientations only):
- Always include in high_level_description: "full body visible from head to feet, no cropping, entire figure within frame"
- Always include in the primary subject element desc: "full body visible, head to feet entirely within frame, no cropping at top or bottom"
- Set subject bbox with sufficient vertical margin: ymin 20–50, ymax 930–970
- Never let the subject bbox touch or exceed the frame edges vertically

When the user specifies a crop (knee-up, waist-up, bust-up):
- Apply the framing guide table above
- Do NOT add full-body language to desc

For 16:9 landscape:
- Do NOT attempt full-body standing figure unless explicitly requested
- Default to waist-up or scene composition
- Distribute elements horizontally to use the wide frame effectively

## bbox verification rule

Before outputting, explicitly calculate:
- vertical pixels = (ymax - ymin) / 1000 × height_px
- horizontal pixels = (xmax - xmin) / 1000 × width_px
- If the user requested full body or knee-up, vertical pixels must be at least:
  - full body: height_px × 0.85 or more
  - knee-up: height_px × 0.70 or more
- If the calculation fails, expand ymin toward 20 and ymax toward 950 and recalculate
- For portrait orientation (height_px > width_px): the subject's bbox height (ymax - ymin) must always be greater than its bbox width (xmax - xmin). Never output a bbox where xmax - xmin > ymax - ymin for a portrait image.
- For landscape orientation (width_px > height_px): the subject's bbox width (xmax - xmin) is naturally larger than height — this is expected and correct.

## Output format

{
  "high_level_description": "...",
  "style_description": {
    "aesthetics": "...",
    "lighting": "...",
    "photo": "...",
    "medium": "...",
    "color_palette": ["#RRGGBB", ...]
  },
  "compositional_deconstruction": {
    "background": "...",
    "elements": [
      {
        "type": "obj",
        "bbox": [ymin, xmin, ymax, xmax],
        "desc": "...",
        "color_palette": ["#RRGGBB", ...]
      }
    ]
  }
}

## Rules

- Key order must be exactly as shown above
- bbox: [ymin, xmin, ymax, xmax] on 0-1000 scale
- color_palette: uppercase #RRGGBB only, max 16 for style_description, max 5 per element
- style uses either "photo" key (photographic) or "art_style" key (illustration/painting) — never both
- If art_style: key order is aesthetics, lighting, medium, art_style, color_palette
- type "text" requires a "text" field inserted between "bbox" and "desc"
- elements listed background-to-foreground
- The primary subject must always be fully contained within the 0-1000 grid — never let head or feet exceed the frame
- Output raw JSON only, nothing else

## Input format

The user will provide:
- Aspect ratio and resolution (e.g. "2:3 1024x1536", "2:3 2048x3072", "1:1 1024x1024", "1:1 2048x2048", "16:9 1680x944", "16:9 1920x1080", "9:16 1080x1920")
- Image description in natural language

Use both the aspect ratio AND the pixel dimensions to calculate bbox coordinates.
Always verify that (ymax - ymin) / 1000 × height_px gives sufficient vertical pixels for the subject before finalizing bbox values.
`;

// ─── Layout Feedback ─────────────────────────────────────────────────

/**
 * 构建布局反馈提示文本，追加到 user message 中用于重试。
 */
export function buildLayoutFeedbackPrompt(feedback: string): string {
  return `\n\n[Layout Feedback]\nThe previous composition had layout quality issues. Please generate an improved version addressing each point:\n\n${feedback}\n\nReturn your complete revised composition as a new \`\`\`json code block.`;
}

// ─── 上下文构建 ─────────────────────────────────────────────────────

/** 构造画布级 Chat 所需的状态片段 */
export interface CanvasChatStoreSnapshot {
  boxes: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    mode: 'obj' | 'text';
    text: string;
    desc: string;
    colors: string[];
    imageDataUrl: string | null;
    imageRole: Box['imageRole'];
  }>;
  canvasW: number;
  canvasH: number;
  globalPalette: string[];
  highLevelDescription: string;
  aesthetics: string;
  lighting: string;
  medium: string;
  artStyle: string;
  background: string;
  photoArtStyleMode: 0 | 1;
}

/**
 * 根据当前 store 状态构建画布上下文字符串。
 * 调用 generateJSON() 获取当前画布的完整 JSON 表示，作为 LLM 的上下文输入。
 */
export function buildCanvasChatContext(snapshot: CanvasChatStoreSnapshot): string {
  const json = generateJSON(
    snapshot.boxes.map((b, i) => ({
      id: `box_${i}`,
      ...b,
    })),
    snapshot.canvasW,
    snapshot.canvasH,
    snapshot.globalPalette,
    snapshot.highLevelDescription,
    snapshot.aesthetics,
    snapshot.lighting,
    snapshot.medium,
    snapshot.artStyle,
    snapshot.background,
    snapshot.photoArtStyleMode,
  );

  return JSON.stringify(json, null, 2);
}

// ─── JSON 提取与验证 ────────────────────────────────────────────────

/**
 * 从 AI 回复文本中提取 JSON 候选内容。
 * 优先使用严格 ```json 代码块；若模型没有遵守格式，再兼容普通代码块、纯 JSON 或带少量说明文字的 JSON 对象。
 */
function extractJSONCandidate(text: string): string | null {
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (jsonBlockMatch?.[1]) return jsonBlockMatch[1].trim();

  const plainBlockMatch = text.match(/```\s*([\s\S]*?)```/);
  if (plainBlockMatch?.[1]) return plainBlockMatch[1].trim();

  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1).trim();
    }
  }

  return null;
}

/**
 * 从 AI 回复文本中提取 JSON，解析并验证为 IdeogramOutput。
 *
 * 验证规则：
 * 1. compositional_deconstruction.elements 存在且为非空数组
 * 2. 每个 element.type ∈ ['obj', 'text']
 * 3. 每个 element.bbox 恰好 4 个值，范围 0-1000
 * 4. 每个 element.desc 为非空字符串
 *
 * @returns 验证通过的 IdeogramOutput，或 null（提取/解析/验证任一失败）
 */
export function extractAndValidateIdeogramJSON(text: string): IdeogramOutput | null {
  const jsonStr = extractJSONCandidate(text);
  if (!jsonStr) return null;

  // 2. JSON.parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  // 3. 类型收窄：必须有 compositional_deconstruction.elements
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  const cd = obj.compositional_deconstruction;
  if (typeof cd !== 'object' || cd === null) return null;

  const cdObj = cd as Record<string, unknown>;
  // ✅ 新增: global color_palette ≤ 5
  const sd = obj.style_description;
  if (typeof sd === 'object' && sd !== null) {
    const sdObj = sd as Record<string, unknown>;
    const globalPalette = sdObj.color_palette;
    if (Array.isArray(globalPalette) && globalPalette.length > 5) return null;
  }
  const elements = cdObj.elements;
  if (!Array.isArray(elements) || elements.length === 0) return null;

  // 4. 验证每个 element
  for (const el of elements) {
    if (typeof el !== 'object' || el === null) return null;
    const e = el as Record<string, unknown>;

    // type ∈ ['obj', 'text']
    if (e.type !== 'obj' && e.type !== 'text') return null;

    // bbox: 恰好 4 个值，范围 0-1000
    const bbox = e.bbox;
    if (!Array.isArray(bbox) || bbox.length !== 4) return null;
    for (const v of bbox) {
      if (typeof v !== 'number' || Number.isNaN(v)) return null;
      if (v < 0) return null;
    }

    // desc: 非空字符串
    if (typeof e.desc !== 'string' || e.desc.trim().length === 0) return null;
    // ✅ 新增: per-element color_palette ≤ 5
    if (Array.isArray(e.color_palette) && e.color_palette.length > 5) return null;
    // ✅ 新增: type=text 且 text 含 CJK 字符 → 拒绝
    if (e.type === 'text' && typeof e.text === 'string') {
      if (CJK_TEXT_RE.test(e.text)) return null;
    }
  }

  return parsed as IdeogramOutput;
}
