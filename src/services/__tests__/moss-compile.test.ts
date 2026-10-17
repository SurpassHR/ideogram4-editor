import { describe, it, expect } from 'vitest';

import { compileMossPrompt } from '../moss-compile';

const draft = {
  width: 1536,
  height: 1024,
  bbox_coord_space: 'abs',
  bbox_format: 'xyxy',
  summary: {
    meta: ['product campaign', 'studio photography'],
    canvas: 'single',
    caption: 'A warm studio campaign for a handmade ceramic cup.',
  },
  items: [
    { label: 'object', caption: 'An ivory ceramic cup.', bbox: [176, 224, 800, 864] },
    { label: 'text', caption: 'Title', text: '把日常，过成诗。', bbox: [928, 272, 1408, 448] },
  ],
};

describe('compileMossPrompt', () => {
  it('caption 草稿原样返回 caption 文本', () => {
    expect(compileMossPrompt({ caption: 'A calm photograph of a ceramic cup.' }))
      .toBe('A calm photograph of a ceramic cup.');
  });

  it('按官方示例向量把像素 xyxy 转成中心原点 yxyx', () => {
    const prompt = compileMossPrompt(draft);
    const parsed = JSON.parse(prompt);
    expect(parsed.items[0].bbox).toEqual([-288, -592, 352, 32]);
    expect(parsed.bbox_coord_space).toBe('abs_centralized');
    expect(parsed.bbox_format).toBe('yxyx');
    expect(Object.keys(parsed)).toEqual(['summary', 'items', 'bbox_coord_space', 'bbox_format']);
    expect(parsed.summary.caption).toBe(draft.summary.caption);
    expect(parsed.items[1].text).toBe('把日常，过成诗。');
  });

  it('输出是单行 JSON（无换行）', () => {
    expect(compileMossPrompt(draft).includes('\n')).toBe(false);
  });

  it('小数边界先 floor 左/上、ceil 右/下，再减半宽半高', () => {
    const prompt = compileMossPrompt({
      width: 96,
      height: 96,
      bbox_coord_space: 'abs',
      bbox_format: 'xyxy',
      summary: { caption: 'x' },
      items: [{ label: 'object', caption: 'y', bbox: [10.5, 20.2, 30.5, 40.2] }],
    });
    const parsed = JSON.parse(prompt);
    // xyxy 输入 [x1=10.5, y1=20.2, x2=30.5, y2=40.2] → yxyx [20-48, 10-48, 41-48, 31-48]
    expect(parsed.items[0].bbox).toEqual([-28, -38, -7, -17]);
  });

  it('画布尺寸不是 16 的倍数时抛错', () => {
    expect(() => compileMossPrompt({ ...draft, width: 1000 })).toThrow(/16/);
  });

  it('标注字段未知时抛错', () => {
    expect(() => compileMossPrompt({
      ...draft,
      items: [{ label: 'object', caption: 'y', bbox: [1, 2, 3, 4], children: [] }],
    })).toThrow(/unknown fields/i);
  });

  it('bbox 越界时抛错', () => {
    expect(() => compileMossPrompt({
      ...draft,
      items: [{ label: 'object', caption: 'y', bbox: [0, 0, 5000, 5000] }],
    })).toThrow(/exceeds/i);
  });

  it('text 元素缺少 text 字段时抛错', () => {
    expect(() => compileMossPrompt({
      ...draft,
      items: [{ label: 'text', caption: 'y', bbox: [1, 2, 3, 4] }],
    })).toThrow(/text/i);
  });
});
