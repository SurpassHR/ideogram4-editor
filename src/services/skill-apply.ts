/**
 * 把 skill 的 extraction 落到画布 — 所有 adapter 共用。
 * extraction.elements 的 bbox 一律是 0-1000 的 [y, x, y, x]。
 */

import type { Box } from '../types';
import { denorm } from '../utils/coordinates';
import { MODE_ARTSTYLE, MODE_PHOTO } from '../types';
import type { SkillExtraction } from './skill-adapters/types';

/** 落画布需要的最小 store 能力（便于单测替换） */
export interface SkillApplyTarget {
  canvasW: number;
  canvasH: number;
  setCanvasDimensions: (width: number, height: number) => void;
  clearBoxes: () => void;
  addBox: (box: Omit<Box, 'id'>) => void;
  setGlobalSetting: (key: string, value: string) => void;
  setPhotoArtStyleMode: (mode: 0 | 1) => void;
  addGlobalColor: (color: string) => void;
}

/**
 * 应用 extraction：
 * - 有 canvas 尺寸时先同步画布
 * - elements 为空时不清空画布（例如 MOSS caption 输出）
 * - 返回落框数量
 */
export function applyExtractionToStore(extraction: SkillExtraction, target: SkillApplyTarget): number {
  if (extraction.elements.length === 0) return 0;

  if (extraction.canvas) {
    target.setCanvasDimensions(extraction.canvas.width, extraction.canvas.height);
  }
  const canvasW = extraction.canvas?.width ?? target.canvasW;
  const canvasH = extraction.canvas?.height ?? target.canvasH;

  target.clearBoxes();
  for (const element of extraction.elements) {
    const [y1, x1, y2, x2] = element.bbox;
    target.addBox({
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
    });
  }

  const globals = extraction.globals;
  if (globals) {
    if (globals.high_level_description !== undefined) {
      target.setGlobalSetting('highLevelDescription', globals.high_level_description);
    }
    if (globals.background !== undefined) {
      target.setGlobalSetting('background', globals.background);
    }
    const style = globals.style_description;
    if (style) {
      if (style.aesthetics !== undefined) target.setGlobalSetting('aesthetics', style.aesthetics);
      if (style.lighting !== undefined) target.setGlobalSetting('lighting', style.lighting);
      // 沿用现有 Apply 语义：photo 变体把 photo 放 medium、medium 放 artStyle
      if (style.photo !== undefined) {
        target.setPhotoArtStyleMode(MODE_PHOTO);
        target.setGlobalSetting('medium', style.photo);
        target.setGlobalSetting('artStyle', style.medium ?? '');
      } else {
        target.setPhotoArtStyleMode(MODE_ARTSTYLE);
        target.setGlobalSetting('medium', style.medium ?? '');
        target.setGlobalSetting('artStyle', style.art_style ?? '');
      }
      for (const color of style.color_palette ?? []) target.addGlobalColor(color);
    }
  }

  return extraction.elements.length;
}
