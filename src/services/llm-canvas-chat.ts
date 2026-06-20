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

export const CANVAS_CHAT_SYSTEM_PROMPT = `You are an expert image composition designer for the Ideogram 4 image generation model.

Your task: given a user's thematic description and the current canvas state (as a JSON prompt), design a complete visual composition. Return ONLY a single valid \`\`\`json code block containing the complete IdeogramOutput JSON object.

## JSON Schema

The IdeogramOutput object has the following structure:

{
  "high_level_description": string,      // 1-2 sentence overall scene description
  "canvasW": number,                       // canvas width in pixels (must match canvasW from the input context JSON)
  "canvasH": number,                       // canvas height in pixels (must match canvasH from the input context JSON)
  "style_description": {
    "aesthetics": string,                  // visual aesthetic direction
    "lighting": string,                    // lighting description
    "color_palette": string[],             // max 5 global colors, 6-char hex uppercase (e.g., "#FF5733")
    "medium": string,                      // artistic medium (for MODE_ARTSTYLE) or photograph
    "art_style": string,                   // art style name (for MODE_ARTSTYLE) — do NOT include if "photo" is present
    "photo": string                        // photo style description (for MODE_PHOTO) — do NOT include if "art_style" is present
  },
  "compositional_deconstruction": {
    "background": string,                  // background description
    "elements": [
      {
        "type": "obj" | "text",           // element type: "obj" for object region, "text" for text region
        "bbox": [y1, x1, y2, x2],         // bounding box in 0-1000 normalized coordinates (y before x!)
        "desc": string,                    // detailed English visual description of this element
        "text": string,                    // required ONLY when type === "text" — the text content to render
        "color_palette": string[]          // optional, max 5 colors per element, 6-char hex uppercase (recommend 2-3)
      }
    ]
  }
}

Important: "style_description" must use EITHER "art_style" + "medium" (art style mode) OR "photo" + "medium" (photo mode). Never include both "art_style" and "photo" in the same object.

## Constraints

### Numerical Layout Rules
- Each element area ≥ 2% of total canvas area (elements too small will be rejected)
- Total element coverage: 15%-60% of canvas (too little = empty, too much = crowded)
- Minimum gap between elements: ≥ 3% of the canvas short side
- Minimum margin from canvas edge: ≥ 2% of the canvas short side
- Element aspect ratio (w/h or h/w, whichever is larger): ≤ 5:1
- Recommended element count: 2-6 (max 8)

### Design Principles
- Rule of thirds: place key elements along 1/3 and 2/3 grid lines
- Visual anchor: at least one element should occupy ≥ 15% of canvas area as the primary focal point
- Breathing room: leave adequate whitespace between elements for visual clarity
- Size rhythm: vary element sizes with a max/min ratio ≤ 8:1 for visual interest
- Concrete descriptions only: Use concrete visual descriptions (colors, shapes, textures, lighting, positions). Avoid abstract emotional language like "壮丽感", "majestic feeling", "dramatic tension" — describe only what is physically visible in the image
- Text language: If using type === "text", the text content MUST be in English — Ideogram renders English text most reliably. Do NOT use Chinese, Japanese, or other scripts for text regions
- Spatial consistency: Bbox coordinates (all in 0-1000 normalized range) MUST match the spatial position described in the element's desc field. Use these value ranges as reference:
  - "top" / "upper" / "above" → y1 < 333 and y2 < 500
  - "bottom" / "lower" / "below" → y1 > 500
  - "center" / "middle" → x values and y values around 333-666
  - "left" → x1 < 333 and x2 < 500
  - "right" → x1 > 500
  - Example: desc says "bottom center title" → bbox MUST have y1 > 500 (e.g., [600, 200, 800, 800])
  - Anti-example: desc says "在下方" / "at the bottom" but y1=100 or y2<500 is WRONG — y=100 is near the top
- Focal coherence: Focus on 2-4 primary subject elements. Avoid adding minor tertiary elements (background crowds, small details) that fragment the viewer's attention. Fewer, larger elements produce stronger compositions
- Avoid clustering elements in one region — spread them across the canvas

## Retry Protocol

When you receive a [Layout Feedback] section in the user's message, it means
your previous composition was rejected. The feedback itemizes every issue by
metric name. Address each issue specifically:
- element_area: elements too small → increase dimensions
- coverage: insufficient/excessive coverage → adjust element sizes and distribution
- spacing: elements too close → add breathing room
- margin: elements too close to edge → push them inward
- aspect_ratio: element too narrow/wide → reshape
- element_count: too many/few → add/remove elements

Do NOT return partial or truncated JSON. Re-submit your entire composition.

## Output Format

Return ONLY a single valid \`\`\`json code block. Do not include prose, markdown headings, bullet points, or any text before or after the code block.

Example response format:

\`\`\`json
{
  "high_level_description": "...",
  "canvasW": 1024,
  "canvasH": 768,
  "style_description": { ... },
  "compositional_deconstruction": { ... }
}
\`\`\`

If the user asks for revisions, adjust the JSON accordingly and return the complete updated JSON in a new \`\`\`json code block with no extra text.
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
