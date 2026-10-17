/**
 * MOSS-Image adapter — 输出是 caption `{"caption":"..."}` 或像素 Layout 草稿
 * `{width,height,bbox_coord_space:"abs",bbox_format:"xyxy",summary,items[]}`。
 * 画布尺寸必须是 16 的倍数（本项目画布本身满足），bbox 为左上角原点的绝对像素 xyxy。
 */

import type { IdeogramElement } from '../../types';
import { compileMossPrompt } from '../moss-compile';
import type { CanvasChatStoreSnapshot } from '../llm-canvas-chat';
import { canvasGlobalSummary } from './context';
import { collectJsonCandidates } from './json-candidates';
import { composeSystemPrompt } from './prompt';
import type {
  SkillAdapter,
  SkillExtraction,
  SkillExtractionError,
  SkillPromptOptions,
} from './types';

const MOSS_BASE_PROMPT = `You are the MOSS-Image prompt enhancer working on the user's canvas.

## Output contract (mandatory)

Choose exactly ONE deliverable:

A) Caption — {"caption":"..."} : cohesive prose with spatial relations in words, no coordinates.

B) Layout — a single JSON object:
   {"width":<int>,"height":<int>,"bbox_coord_space":"abs","bbox_format":"xyxy",
    "summary":{"caption":"...","meta":["..."],"canvas":"single|multi_panel|collage"},
    "items":[{"label":"object|character|text","caption":"...","bbox":[x1,y1,x2,y2],"text":"..."}]}
   Rules for Layout:
   - bbox is ABSOLUTE PIXELS from the canvas top-left, xyxy order; never normalized, never centered — the build tool does the centering.
   - width and height are the final image size and must be positive multiples of 16.
   - label must be object, character or text; "text" items require the exact visible characters in "text".
   - item captions describe visible appearance; keep JSON/bounding-box instructions out of image descriptions.
   - extra fields (children, parent, id, presentation notes) are rejected.

Wrap the JSON in a \`\`\`json code block and put nothing after it.`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function to1000(value: number, max: number): number {
  if (!(max > 0)) return 0;
  return Math.min(1000, Math.max(0, Math.round((value / max) * 1000)));
}

export const mossLayoutAdapter: SkillAdapter = {
  id: 'moss-layout',
  label: 'MOSS-Image Layout',

  buildSystemPrompt(skill, opts: SkillPromptOptions) {
    return composeSystemPrompt(MOSS_BASE_PROMPT, skill, opts);
  },

  buildCanvasContext(snapshot: CanvasChatStoreSnapshot, targetSize: number) {
    return JSON.stringify({
      canvas: {
        width: snapshot.canvasW,
        height: snapshot.canvasH,
        target_render_size: `${targetSize}x${targetSize}`,
        rule: 'width/height must be positive multiples of 16',
      },
      draft_bbox_convention: 'absolute pixels, xyxy, origin top-left',
      globals: canvasGlobalSummary(snapshot),
      elements: snapshot.boxes.map((box, index) => ({
        id: `${box.mode === 'text' ? 'text' : 'object'}_${index + 1}`,
        label: box.mode === 'text' ? 'text' : 'object',
        bbox: [
          Math.round(box.x),
          Math.round(box.y),
          Math.round(box.x + box.w),
          Math.round(box.y + box.h),
        ],
        caption: box.desc,
        ...(box.mode === 'text' && box.text ? { text: box.text } : {}),
      })),
      background_reference: snapshot.canvasBackgroundUrl
        ? 'present (attached as image in the same message)'
        : 'none',
    }, null, 2);
  },

  extract(text: string): SkillExtraction | SkillExtractionError {
    for (const candidate of collectJsonCandidates(text, 'object')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(candidate);
      } catch {
        continue;
      }
      if (!isRecord(parsed)) continue;

      if ('caption' in parsed && !('items' in parsed)) {
        return {
          adapter: 'moss-layout',
          elements: [],
          raw: text,
          warnings: ['该输出是 caption（没有 bbox），无法 Apply 到画布，可直接复制使用。'],
          payload: parsed,
        };
      }

      if (!('items' in parsed) || !('width' in parsed) || !('height' in parsed)) continue;

      try {
        compileMossPrompt(parsed);
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error), raw: text };
      }

      const width = parsed.width as number;
      const height = parsed.height as number;
      const items = parsed.items as Array<Record<string, unknown>>;
      const elements: IdeogramElement[] = items.map(item => {
        const bbox = item.bbox as [number, number, number, number];
        const element: IdeogramElement = {
          type: item.label === 'text' ? 'text' : 'obj',
          bbox: [
            to1000(bbox[1], height),
            to1000(bbox[0], width),
            to1000(bbox[3], height),
            to1000(bbox[2], width),
          ],
          desc: typeof item.caption === 'string' ? item.caption : '',
        };
        if (item.label === 'text' && typeof item.text === 'string') element.text = item.text;
        if (Array.isArray(item.palette)) element.color_palette = item.palette as string[];
        return element;
      });

      return {
        adapter: 'moss-layout',
        elements,
        canvas: { width, height },
        raw: text,
        warnings: [],
        payload: parsed,
      };
    }

    return { error: '未找到 MOSS-Image 的 caption 或 Layout 草稿 JSON。', raw: text };
  },

  toCopyText(extraction: SkillExtraction) {
    if (extraction.payload !== undefined) {
      try {
        return compileMossPrompt(extraction.payload);
      } catch {
        return extraction.raw;
      }
    }
    return extraction.raw;
  },
};
