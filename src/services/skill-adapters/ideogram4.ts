/**
 * Ideogram 4 adapter — 基础 prompt 沿用项目现有的 CANVAS_CHAT_SYSTEM_PROMPT
 * （保留画布像素/取景规则），skill 文本作为附加章节注入。
 */

import type { IdeogramElement, IdeogramOutput } from '../../types';
import { detectBboxSystem } from '../../utils/coordinates';
import {
  CANVAS_CHAT_SYSTEM_PROMPT,
  buildCanvasChatContext,
  validateIdeogramJSONVerbose,
  type CanvasChatStoreSnapshot,
} from '../llm-canvas-chat';
import { composeSystemPrompt } from './prompt';
import { normalizeBboxTo1000 } from './bbox';
import type {
  SkillAdapter,
  SkillExtractContext,
  SkillExtraction,
  SkillExtractionError,
  SkillPromptOptions,
} from './types';

export const ideogram4Adapter: SkillAdapter = {
  id: 'ideogram4',
  label: 'Ideogram 4 JSON',

  buildSystemPrompt(skill, opts: SkillPromptOptions) {
    return composeSystemPrompt(CANVAS_CHAT_SYSTEM_PROMPT, skill, opts);
  },

  buildCanvasContext(snapshot: CanvasChatStoreSnapshot) {
    return buildCanvasChatContext(snapshot);
  },

  extract(text: string, ctx: SkillExtractContext): SkillExtraction | SkillExtractionError {
    const { output, error } = validateIdeogramJSONVerbose(text);
    if (!output) return { error: error ?? '无法解析 Ideogram JSON 输出。', raw: text };

    return buildIdeogramExtraction(output, text, ctx);
  },

  toCopyText(extraction: SkillExtraction) {
    return extraction.ideogramOutput
      ? JSON.stringify(extraction.ideogramOutput)
      : extraction.raw;
  },
};

/** 由 IdeogramOutput 构造统一的 extraction（bbox 归一化到 0-1000） */
export function buildIdeogramExtraction(
  output: IdeogramOutput,
  raw: string,
  ctx: SkillExtractContext,
): SkillExtraction {
  const elements = output.compositional_deconstruction.elements;
  const system = detectBboxSystem(elements);
  const canvasW = output.canvasW ?? ctx.canvasW;
  const canvasH = output.canvasH ?? ctx.canvasH;
  const warnings: string[] = [];
  if (system === 'pixel') {
    warnings.push(`bbox 使用像素坐标，已按 ${canvasW}x${canvasH} 归一化。`);
  } else if (system === 'fractional') {
    warnings.push('bbox 使用 0-1 分数坐标，已放大到 0-1000。');
  }

  const normalized: IdeogramElement[] = elements.map(el => ({
    ...el,
    bbox: normalizeBboxTo1000(el.bbox, system, canvasW, canvasH),
  }));

  return {
    adapter: 'ideogram4',
    elements: normalized,
    globals: {
      high_level_description: output.high_level_description,
      style_description: output.style_description,
      background: output.compositional_deconstruction.background,
    },
    canvas: output.canvasW && output.canvasH
      ? { width: output.canvasW, height: output.canvasH }
      : undefined,
    raw,
    warnings,
    ideogramOutput: output,
  };
}
