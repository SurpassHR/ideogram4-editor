/**
 * 把 skill 的 extraction 落到画布 — 所有 adapter 共用。
 * extraction.elements 的 bbox 一律是 0-1000 的 [y, x, y, x]。
 *
 * Apply 采用「一次性提交」语义：先在纯函数里算出目标画布状态，
 * 再由 store 单次写入并只压一次撤销快照 —— 一次 Ctrl+Z 即可整体还原。
 */

import type { Box, PhotoArtStyleMode } from '../types';
import { denorm } from '../utils/coordinates';
import { normalizeCanvasSize } from '../utils/canvas-dims';
import { MODE_ARTSTYLE, MODE_PHOTO } from '../types';
import type { SkillExtraction } from './skill-adapters/types';

/** 全局调色板上限（与 store.addGlobalColor 保持一致） */
const MAX_GLOBAL_PALETTE = 5;

/** 一次 Apply 后的完整画布状态 */
export interface CanvasReplacement {
  canvasW: number;
  canvasH: number;
  boxes: Array<Omit<Box, 'id'>>;
  globalPalette: string[];
  highLevelDescription: string;
  aesthetics: string;
  lighting: string;
  medium: string;
  artStyle: string;
  background: string;
  photoArtStyleMode: PhotoArtStyleMode;
}

/** 落画布需要的最小 store 能力（便于单测替换） */
export interface SkillApplyTarget {
  canvasW: number;
  canvasH: number;
  /** 单次提交整份画布状态（由 store 负责压一次撤销快照） */
  applyCanvasReplacement: (replacement: CanvasReplacement) => void;
}

/** 按 store 的规则归一化调色板（大写、去重、封顶） */
function normalizePalette(colors: readonly string[] | undefined): string[] {
  if (!colors) return [];
  const result: string[] = [];
  for (const color of colors) {
    const upper = color.toUpperCase();
    if (result.includes(upper)) continue;
    result.push(upper);
    if (result.length >= MAX_GLOBAL_PALETTE) break;
  }
  return result;
}

/** 把 element 的 0-1000 bbox 反归一化为画布像素 */
function elementToBox(
  element: SkillExtraction['elements'][number],
  canvasW: number,
  canvasH: number,
): Omit<Box, 'id'> {
  const [y1, x1, y2, x2] = element.bbox;
  return {
    x: denorm(x1, canvasW),
    y: denorm(y1, canvasH),
    w: denorm(x2 - x1, canvasW),
    h: denorm(y2 - y1, canvasH),
    mode: element.type === 'text' ? 'text' : 'obj',
    text: element.text || '',
    desc: element.desc || '',
    colors: element.color_palette || [],
    imageDataUrl: null,
    imageRole: 'both' as const,
  };
}

/**
 * 计算 extraction 对应的目标画布状态（纯函数，不写 store）。
 *
 * - 模型返回的 canvas 尺寸会应用到画板（先改尺寸，再按新尺寸反归一化 bbox）
 * - 尺寸非法/缺失（或越界无法等比缩放）时保留当前画板
 * - 语义沿用旧版 clearBoxes + 逐项写入：未提供的全局字段视为被清空
 */
export function buildCanvasReplacement(
  extraction: SkillExtraction,
  target: { canvasW: number; canvasH: number },
): CanvasReplacement {
  const size = extraction.canvas
    ? normalizeCanvasSize(extraction.canvas.width, extraction.canvas.height)
    : null;
  const canvasW = size ? size.width : target.canvasW;
  const canvasH = size ? size.height : target.canvasH;

  const globals = extraction.globals;
  const style = globals?.style_description;

  // 沿用既有 Apply 语义：photo 变体把 photo 放 medium、medium 放 artStyle
  const isPhoto = style?.photo !== undefined;
  const photoArtStyleMode: PhotoArtStyleMode = isPhoto ? MODE_PHOTO : MODE_ARTSTYLE;

  return {
    canvasW,
    canvasH,
    boxes: extraction.elements.map(el => elementToBox(el, canvasW, canvasH)),
    globalPalette: normalizePalette(style?.color_palette),
    highLevelDescription: globals?.high_level_description ?? '',
    aesthetics: style?.aesthetics ?? '',
    lighting: style?.lighting ?? '',
    medium: isPhoto ? (style?.photo ?? '') : (style?.medium ?? ''),
    artStyle: isPhoto ? (style?.medium ?? '') : (style?.art_style ?? ''),
    background: globals?.background ?? '',
    photoArtStyleMode,
  };
}

/**
 * 应用 extraction：整份画布状态一次性提交。
 *
 * - elements 为空时不清空画布（例如 MOSS caption 输出）
 * - 返回落框数量（0 表示未落框）
 */
export function applyExtractionToStore(extraction: SkillExtraction, target: SkillApplyTarget): number {
  if (extraction.elements.length === 0) return 0;

  target.applyCanvasReplacement(buildCanvasReplacement(extraction, target));
  return extraction.elements.length;
}

/**
 * 区域 Apply：只替换指定 box，画布其余内容与全局设置保持不变。
 *
 * - 若 extraction 带 canvas 尺寸，区域内 bbox 仍按新尺寸反归一化
 * - 目标 box 不存在时返回 0（不落框）
 * - 返回落框数量
 */
export function applyRegionExtractionToStore(
  extraction: SkillExtraction,
  target: SkillApplyTarget & {
    replaceBox: (id: string, box: Omit<Box, 'id'>) => void;
    hasBox: (id: string) => boolean;
  },
  regionBoxId: string,
): number {
  if (extraction.elements.length === 0) return 0;
  if (!target.hasBox(regionBoxId)) return 0;

  const size = extraction.canvas
    ? normalizeCanvasSize(extraction.canvas.width, extraction.canvas.height)
    : null;
  const canvasW = size ? size.width : target.canvasW;
  const canvasH = size ? size.height : target.canvasH;

  // 区域模式下只取第一个元素落到目标 box（区域语义是「这一块换成什么」）
  const box = elementToBox(extraction.elements[0], canvasW, canvasH);
  target.replaceBox(regionBoxId, box);
  return 1;
}

