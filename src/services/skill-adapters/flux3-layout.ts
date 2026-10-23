/**
 * FLUX 3 Image Klein adapter — 输出是「完整画面正文 + 末尾 JSON 数组」，
 * bbox 为 [top, left, bottom, right] 0-1000（编辑行用 from/src_bbox/tgt_bbox）。
 */

import type { IdeogramElement } from '../../types';
import { detectBboxSystem } from '../../utils/coordinates';
import { computeTargetCanvasSize, formatAspectRatio } from '../../utils/canvas-dims';
import type { CanvasChatStoreSnapshot } from '../llm-canvas-chat';
import { normalizeBboxTo1000 } from './bbox';
import { canvasElementsTo1000, canvasGlobalSummary } from './context';
import { collectJsonCandidates } from './json-candidates';
import { composeSystemPrompt } from './prompt';
import type {
  SkillAdapter,
  SkillExtractContext,
  SkillExtraction,
  SkillExtractionError,
  SkillPromptOptions,
} from './types';

const FLUX3_BASE_PROMPT = `You are a FLUX 3 Image Klein prompt writer working on the user's canvas.

## Output contract (mandatory)

1. Write ONE complete paragraph describing the FULL final image in English, using <id> markers (e.g. <obj_1>, <headline_1>) for every element you place. The paragraph is the prompt the model reads — never describe the JSON itself.
2. Then append a JSON array of placement rows, one per element:
   [{"id":"obj_1","bbox":[top, left, bottom, right],"desc":"what the element looks like"}]
   bbox values are integers on the 0-1000 grid, origin top-left, with top < bottom and left < right.
3. Wrap the JSON array in a \`\`\`json code block. Never emit [left, top, right, bottom].
4. The box decides WHERE, the row "desc" decides WHAT the object is, and the paragraph decides how it changes.
5. When editing an existing image, use rows of {"id","from","src_bbox","tgt_bbox","desc"} instead of "bbox" (from = "ref_image_0", "ref_image_1", ...; tgt_bbox = null removes the element).
6. The final answer must be usable as a single text prompt for a FLUX 3 layout workflow: no commentary, no extra tables.`;

interface Flux3Row {
  id?: unknown;
  bbox?: unknown;
  tgt_bbox?: unknown;
  desc?: unknown;
  type?: unknown;
  label?: unknown;
  text?: unknown;
}

function parseBbox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  if (value.some(v => typeof v !== 'number' || !Number.isFinite(v))) return null;
  return [value[0], value[1], value[2], value[3]] as [number, number, number, number];
}

export const flux3LayoutAdapter: SkillAdapter = {
  id: 'flux3-layout',
  label: 'FLUX 3 Klein Layout',

  buildSystemPrompt(skill, opts: SkillPromptOptions) {
    return composeSystemPrompt(FLUX3_BASE_PROMPT, skill, opts);
  },

  buildCanvasContext(snapshot: CanvasChatStoreSnapshot, targetSize: number) {
    const target = computeTargetCanvasSize(snapshot.canvasW, snapshot.canvasH, targetSize);
    return JSON.stringify({
      canvas: {
        width: snapshot.canvasW,
        height: snapshot.canvasH,
        aspect_ratio: formatAspectRatio(snapshot.canvasW, snapshot.canvasH),
        target_render_size: `${target.width}x${target.height}`,
      },
      bbox_format: '0-1000 [top, left, bottom, right]',
      globals: canvasGlobalSummary(snapshot),
      elements: canvasElementsTo1000(snapshot),
      background_reference: snapshot.canvasBackgroundUrl
        ? 'present (attached as image in the same message)'
        : 'none',
    }, null, 2);
  },

  extract(text: string, ctx: SkillExtractContext): SkillExtraction | SkillExtractionError {
    const warnings: string[] = [];
    let rows: Flux3Row[] | null = null;

    for (const candidate of collectJsonCandidates(text, 'array')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(candidate);
      } catch {
        continue;
      }
      if (Array.isArray(parsed) && parsed.length > 0) {
        rows = parsed as Flux3Row[];
        break;
      }
    }

    if (!rows) {
      return { error: '未在输出中找到 JSON 数组（bbox 表）。', raw: text };
    }

    const parsedRows: Array<{ element: IdeogramElement; bbox: [number, number, number, number] }> = [];
    let skipped = 0;
    for (const row of rows) {
      if (!row || typeof row !== 'object') { skipped += 1; continue; }
      const id = typeof row.id === 'string' ? row.id : '';
      const bbox = parseBbox(row.bbox) ?? parseBbox(row.tgt_bbox);
      if (!bbox) {
        if (row.tgt_bbox === null) {
          warnings.push(`元素 ${id || '?'} 的 tgt_bbox 为 null（表示删除），已跳过。`);
        } else {
          skipped += 1;
        }
        continue;
      }
      const desc = typeof row.desc === 'string' && row.desc.trim() ? row.desc.trim() : '';
      if (!desc) { skipped += 1; continue; }
      const isText = row.type === 'text' || row.label === 'text';
      const element: IdeogramElement = {
        type: isText ? 'text' : 'obj',
        bbox: [0, 0, 0, 0],
        desc,
      };
      if (isText && typeof row.text === 'string') element.text = row.text;
      parsedRows.push({ element, bbox });
    }

    if (parsedRows.length === 0) {
      return { error: 'JSON 数组里没有可用的 bbox 元素（需要 bbox/tgt_bbox 与 desc）。', raw: text };
    }
    if (skipped > 0) {
      warnings.push(`有 ${skipped} 行缺少有效 bbox/desc，已跳过。`);
    }

    const system = detectBboxSystem(parsedRows.map(row => ({ bbox: row.bbox })));
    if (system === 'fractional') warnings.push('bbox 使用 0-1 分数坐标，已放大到 0-1000。');

    const elements = parsedRows.map(({ element, bbox }) => ({
      ...element,
      bbox: normalizeBboxTo1000(bbox, system, ctx.canvasW, ctx.canvasH),
    }));

    return { adapter: 'flux3-layout', elements, raw: text, warnings };
  },

  toCopyText(extraction: SkillExtraction) {
    return extraction.raw;
  },

  /** FLUX3 没有 high_level_description，用首个元素描述作为摘要 */
  summarize(extraction: SkillExtraction) {
    const first = extraction.elements.find(el => el.desc?.trim());
    return first?.desc.trim() ?? '';
  },
};
