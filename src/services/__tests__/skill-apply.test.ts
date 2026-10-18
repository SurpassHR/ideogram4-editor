import { describe, it, expect, vi } from 'vitest';

import { applyExtractionToStore, type SkillApplyTarget } from '../skill-apply';
import type { SkillExtraction } from '../skill-adapters/types';

function makeTarget(): SkillApplyTarget & {
  boxes: unknown[];
  globals: Record<string, unknown>;
  /** 调用顺序记录，用于断言「先改尺寸再落框」 */
  calls: string[];
} {
  const boxes: unknown[] = [];
  const globals: Record<string, unknown> = {};
  const calls: string[] = [];
  // 用独立 holder 避免对象字面量自引用导致的循环类型推断
  const dims = { w: 1000, h: 2000 };
  return {
    boxes,
    globals,
    calls,
    get canvasW() { return dims.w; },
    get canvasH() { return dims.h; },
    // 模拟 store：改尺寸后后续反归一化使用新画板
    setCanvasDimensions: vi.fn((w: number, h: number) => {
      calls.push('setCanvasDimensions');
      dims.w = w;
      dims.h = h;
    }),
    clearBoxes: vi.fn(() => { calls.push('clearBoxes'); }),
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

  it('模型返回的画布尺寸会应用到画板，bbox 按新尺寸反归一化', () => {
    const target = makeTarget();
    const count = applyExtractionToStore({ ...extraction, canvas: { width: 1536, height: 1024 } }, target);

    expect(count).toBe(2);
    expect(target.setCanvasDimensions).toHaveBeenCalledWith(1536, 1024);
    // 必须先改尺寸再清空/落框，否则 bbox 会按旧画板换算
    expect(target.calls).toEqual(['setCanvasDimensions', 'clearBoxes']);

    const first = target.boxes[0] as Record<string, number>;
    expect(first.x).toBeCloseTo(0.2 * 1536, 1);
    expect(first.y).toBeCloseTo(0.1 * 1024, 1);
    expect(first.w).toBeCloseTo(0.6 * 1536, 1);
    expect(first.h).toBeCloseTo(0.4 * 1024, 1);
  });

  it('画布尺寸非法或缺失时保持画板不变', () => {
    const target = makeTarget();
    applyExtractionToStore({ ...extraction, canvas: { width: 0, height: 1024 } }, target);

    expect(target.setCanvasDimensions).not.toHaveBeenCalled();
    // 仍按画板 1000x2000 反归一化
    expect(target.boxes[0]).toMatchObject({ x: 200, y: 200, w: 600, h: 800 });
  });

  it('没有 elements（如 MOSS caption）时不清空画布', () => {
    const target = makeTarget();
    const count = applyExtractionToStore({ ...extraction, elements: [] }, target);
    expect(count).toBe(0);
    expect(target.clearBoxes).not.toHaveBeenCalled();
  });
});
