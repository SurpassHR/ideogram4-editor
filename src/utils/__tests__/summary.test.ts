import { describe, it, expect } from 'vitest';

import { buildExtractionSummary, normalizeSummaryText, resolveSummaryText } from '../summary';
import type { SkillExtraction } from '../../services/skill-adapters/types';

function makeExtraction(overrides: Partial<SkillExtraction> = {}): SkillExtraction {
  return {
    adapter: 'ideogram4',
    elements: [],
    raw: '',
    warnings: [],
    ...overrides,
  };
}

describe('normalizeSummaryText', () => {
  it('压平换行与多余空白', () => {
    expect(normalizeSummaryText('a\n  b\n\nc')).toBe('a b c');
  });

  it('超长时截断并加省略号', () => {
    const result = normalizeSummaryText('x'.repeat(50), 10);
    expect(result.length).toBe(10);
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('buildExtractionSummary', () => {
  it('优先使用 adapter 自带的 summary', () => {
    const extraction = makeExtraction({
      summary: 'adapter 摘要',
      globals: { high_level_description: '场景概述' },
      elements: [{ type: 'obj', bbox: [0, 0, 1, 1], desc: '元素描述' }],
    });
    expect(buildExtractionSummary(extraction)).toBe('adapter 摘要');
  });

  it('无 summary 时回退到 high_level_description', () => {
    const extraction = makeExtraction({
      globals: { high_level_description: '一张杂志风封面' },
      elements: [{ type: 'obj', bbox: [0, 0, 1, 1], desc: '元素描述' }],
    });
    expect(buildExtractionSummary(extraction)).toBe('一张杂志风封面');
  });

  it('无 high_level_description 时回退到首个元素的 desc', () => {
    const extraction = makeExtraction({
      elements: [
        { type: 'obj', bbox: [0, 0, 1, 1], desc: '' },
        { type: 'obj', bbox: [0, 0, 1, 1], desc: '一个红色圆形' },
      ],
    });
    expect(buildExtractionSummary(extraction)).toBe('一个红色圆形');
  });

  it('没有任何可用文本时返回空串', () => {
    expect(buildExtractionSummary(makeExtraction())).toBe('');
  });
});

describe('resolveSummaryText', () => {
  it('摘要缺失时使用兜底文案', () => {
    expect(resolveSummaryText(makeExtraction(), '生成了 3 个元素')).toBe('生成了 3 个元素');
  });

  it('有摘要时忽略兜底文案', () => {
    const extraction = makeExtraction({ globals: { high_level_description: '场景' } });
    expect(resolveSummaryText(extraction, '生成了 3 个元素')).toBe('场景');
  });
});

