import { describe, it, expect, vi } from 'vitest';

import {
  applyExtractionToStore,
  applyRegionExtractionToStore,
  buildCanvasReplacement,
  type CanvasReplacement,
  type SkillApplyTarget,
} from '../skill-apply';
import type { SkillExtraction } from '../skill-adapters/types';

/** 收集一次性提交的画布状态（替代旧的逐步 clearBoxes/addBox） */
function makeTarget(): SkillApplyTarget & {
  submitted: CanvasReplacement[];
  applyCanvasReplacement: ReturnType<typeof vi.fn>;
} {
  const submitted: CanvasReplacement[] = [];
  // 用独立 holder 避免对象字面量自引用导致的循环类型推断
  const dims = { w: 1000, h: 2000 };
  return {
    submitted,
    get canvasW() { return dims.w; },
    get canvasH() { return dims.h; },
    applyCanvasReplacement: vi.fn((replacement: CanvasReplacement) => {
      submitted.push(replacement);
      dims.w = replacement.canvasW;
      dims.h = replacement.canvasH;
    }),
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
    // 整份画布状态一次性提交（只产生一次撤销步骤）
    expect(target.applyCanvasReplacement).toHaveBeenCalledTimes(1);

    const replacement = target.submitted[0];
    expect(replacement.boxes[0]).toMatchObject({
      x: 200, y: 200, w: 600, h: 800, mode: 'obj', desc: 'a cat',
    });
    expect(replacement.boxes[1]).toMatchObject({
      x: 100, y: 1200, w: 200, h: 200, mode: 'text', text: 'HELLO',
    });
  });

  it('写入全局风格字段与调色板', () => {
    const target = makeTarget();
    applyExtractionToStore(extraction, target);
    const replacement = target.submitted[0];
    expect(replacement.highLevelDescription).toBe('A scene');
    expect(replacement.background).toBe('bg');
    expect(replacement.aesthetics).toBe('warm');
    expect(replacement.lighting).toBe('soft');
    expect(replacement.globalPalette).toEqual(['#FFFFFF']);
    // photo 变体：photo -> medium，medium -> artStyle（沿用现有 Apply 语义）
    expect(replacement.photoArtStyleMode).toBe(0);
    expect(replacement.medium).toBe('85mm');
    expect(replacement.artStyle).toBe('photograph');
  });

  it('模型返回的画布尺寸会应用到画板，bbox 按新尺寸反归一化', () => {
    const target = makeTarget();
    const count = applyExtractionToStore({ ...extraction, canvas: { width: 1536, height: 1024 } }, target);

    expect(count).toBe(2);
    const replacement = target.submitted[0];
    expect(replacement.canvasW).toBe(1536);
    expect(replacement.canvasH).toBe(1024);
    // 必须先改尺寸再落框，否则 bbox 会按旧画板换算
    const first = replacement.boxes[0];
    expect(first.x).toBeCloseTo(0.2 * 1536, 1);
    expect(first.y).toBeCloseTo(0.1 * 1024, 1);
    expect(first.w).toBeCloseTo(0.6 * 1536, 1);
    expect(first.h).toBeCloseTo(0.4 * 1024, 1);
  });

  it('画布尺寸非法或缺失时保持画板不变', () => {
    const target = makeTarget();
    applyExtractionToStore({ ...extraction, canvas: { width: 0, height: 1024 } }, target);

    const replacement = target.submitted[0];
    expect(replacement.canvasW).toBe(1000);
    expect(replacement.canvasH).toBe(2000);
    // 仍按画板 1000x2000 反归一化
    expect(replacement.boxes[0]).toMatchObject({ x: 200, y: 200, w: 600, h: 800 });
  });

  it('没有 elements（如 MOSS caption）时不清空画布', () => {
    const target = makeTarget();
    const count = applyExtractionToStore({ ...extraction, elements: [] }, target);
    expect(count).toBe(0);
    expect(target.applyCanvasReplacement).not.toHaveBeenCalled();
  });

  it('调色板去重、大写并封顶 5 色', () => {
    const target = makeTarget();
    applyExtractionToStore({
      ...extraction,
      globals: {
        ...extraction.globals,
        style_description: {
          aesthetics: 'warm',
          color_palette: ['#ffffff', '#FFFFFF', '#aaaaaa', '#bbbbbb', '#cccccc', '#dddddd'],
        },
      },
    }, target);
    expect(target.submitted[0].globalPalette).toEqual(['#FFFFFF', '#AAAAAA', '#BBBBBB', '#CCCCCC', '#DDDDDD']);
  });
});

describe('buildCanvasReplacement', () => {
  it('未提供的全局字段视为被清空', () => {
    const replacement = buildCanvasReplacement(
      { adapter: 'ideogram4', elements: [{ type: 'obj', bbox: [0, 0, 100, 100], desc: 'x' }], raw: '', warnings: [] },
      { canvasW: 1000, canvasH: 1000 },
    );
    expect(replacement.highLevelDescription).toBe('');
    expect(replacement.aesthetics).toBe('');
    expect(replacement.globalPalette).toEqual([]);
  });
});

describe('applyRegionExtractionToStore', () => {
  function makeRegionTarget() {
    const replaced: Array<{ id: string; box: Record<string, unknown> }> = [];
    const boxes = new Set(['box_0', 'box_1']);
    return {
      replaced,
      target: {
        canvasW: 1000,
        canvasH: 2000,
        applyCanvasReplacement: vi.fn(),
        hasBox: (id: string) => boxes.has(id),
        replaceBox: (id: string, box: Record<string, unknown>) => { replaced.push({ id, box }); },
      },
    };
  }

  it('只替换目标 box，不动画布其余内容', () => {
    const { target, replaced } = makeRegionTarget();
    const count = applyRegionExtractionToStore(extraction, target, 'box_1');
    expect(count).toBe(1);
    expect(replaced).toHaveLength(1);
    expect(replaced[0].id).toBe('box_1');
    expect(replaced[0].box).toMatchObject({ x: 200, y: 200, w: 600, h: 800 });
    // 区域 Apply 不提交整份画布状态
    expect(target.applyCanvasReplacement).not.toHaveBeenCalled();
  });

  it('目标 box 不存在时不落框', () => {
    const { target, replaced } = makeRegionTarget();
    expect(applyRegionExtractionToStore(extraction, target, 'missing')).toBe(0);
    expect(replaced).toHaveLength(0);
  });
});

