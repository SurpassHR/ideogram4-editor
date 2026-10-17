import { describe, it, expect, vi } from 'vitest';

import { applyExtractionToStore, type SkillApplyTarget } from '../skill-apply';
import type { SkillExtraction } from '../skill-adapters/types';

function makeTarget(): SkillApplyTarget & {
  boxes: unknown[];
  globals: Record<string, unknown>;
  setCanvasDimensions: ReturnType<typeof vi.fn>;
} {
  const boxes: unknown[] = [];
  const globals: Record<string, unknown> = {};
  return {
    boxes,
    globals,
    canvasW: 1000,
    canvasH: 2000,
    setCanvasDimensions: vi.fn(),
    clearBoxes: vi.fn(),
    addBox: vi.fn((box: unknown) => { boxes.push(box); }),
    setGlobalSetting: vi.fn((key: string, value: string) => { globals[key] = value; }),
    setPhotoArtStyleMode: vi.fn(),
    addGlobalColor: vi.fn(),
  };
}

const extraction: SkillExtraction = {
  adapter: 'ideogram4',
  elements: [
    { type: 'obj', bbox: [100, 200, 500, 800], desc: 'a cat' },
    { type: 'text', bbox: [600, 100, 700, 300], text: 'HELLO', desc: 'title' },
  ],
  globals: {
    high_level_description: 'A scene',
    background: 'bg',
    style_description: {
      aesthetics: 'warm',
      lighting: 'soft',
      medium: 'photograph',
      photo: '85mm',
      color_palette: ['#FFFFFF'],
    },
  },
  raw: 'x',
  warnings: [],
};

describe('applyExtractionToStore', () => {
  it('按 0-1000 bbox 落框到画布（yxyx → 像素）', () => {
    const target = makeTarget();
    const count = applyExtractionToStore(extraction, target);
    expect(count).toBe(2);
    expect(target.clearBoxes).toHaveBeenCalled();
    expect(target.boxes[0]).toMatchObject({
      x: 200, y: 200, w: 600, h: 800, mode: 'obj', desc: 'a cat',
    });
    expect(target.boxes[1]).toMatchObject({
      x: 100, y: 1200, w: 200, h: 200, mode: 'text', text: 'HELLO',
    });
  });

  it('写入全局风格字段与调色板', () => {
    const target = makeTarget();
    applyExtractionToStore(extraction, target);
    expect(target.setGlobalSetting).toHaveBeenCalledWith('highLevelDescription', 'A scene');
    expect(target.setGlobalSetting).toHaveBeenCalledWith('background', 'bg');
    expect(target.setGlobalSetting).toHaveBeenCalledWith('aesthetics', 'warm');
    expect(target.addGlobalColor).toHaveBeenCalledWith('#FFFFFF');
    // photo 变体：photo → medium，medium → artStyle（沿用现有 Apply 语义）
    expect(target.setPhotoArtStyleMode).toHaveBeenCalledWith(0);
    expect(target.setGlobalSetting).toHaveBeenCalledWith('medium', '85mm');
    expect(target.setGlobalSetting).toHaveBeenCalledWith('artStyle', 'photograph');
  });

  it('模型返回的画布尺寸不覆盖画板（保护用户在画板选好的比例）', () => {
    const target = makeTarget();
    const count = applyExtractionToStore({ ...extraction, canvas: { width: 1536, height: 1024 } }, target);

    expect(target.setCanvasDimensions).not.toHaveBeenCalled();
    expect(count).toBe(2);
    // 仍按画板 1000x2000 反归一化（bbox 是 0-1000 归一化值）
    expect(target.boxes[0]).toMatchObject({ x: 200, y: 200, w: 600, h: 800 });
  });

  it('没有 elements（如 MOSS caption）时不清空画布', () => {
    const target = makeTarget();
    const count = applyExtractionToStore({ ...extraction, elements: [] }, target);
    expect(count).toBe(0);
    expect(target.clearBoxes).not.toHaveBeenCalled();
  });
});
