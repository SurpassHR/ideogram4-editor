import { describe, it, expect } from 'vitest';

import { getAdapter, listAdapters } from '../skill-adapters';
import { planSkillPrompt, renderSkillPrompt } from '../skill-adapters/prompt';
import { CANVAS_CHAT_SYSTEM_PROMPT } from '../llm-canvas-chat';
import type { SkillRecord } from '../../types/skill';

function makeSkill(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 'skill_test_1',
    name: 'test-skill',
    displayName: 'Test Skill',
    description: 'test',
    source: 'imported',
    sourceUrl: null,
    license: null,
    version: null,
    adapter: 'ideogram4',
    adapterConfirmed: true,
    files: [
      { path: 'SKILL.md', content: '# Test Skill\n\nMARKER_SKILL_BODY' },
      { path: 'references/schema.md', content: 'MARKER_SCHEMA' },
    ],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('skill adapter registry', () => {
  it('注册已实现的 adapter 且能按 id 取回', () => {
    expect(listAdapters().map(a => a.id).sort()).toEqual([
      'flux3-layout',
      'ideogram4',
      'moss-layout',
      'none',
    ]);
    expect(getAdapter('ideogram4').label).toBe('Ideogram 4 JSON');
    expect(getAdapter('flux3-layout').label).toBe('FLUX 3 Klein Layout');
    expect(getAdapter('moss-layout').label).toBe('MOSS-Image Layout');
    expect(getAdapter('none').label).toBe('Plain text');
  });
});

describe('moss-layout adapter', () => {
  const adapter = getAdapter('moss-layout');
  const draft = {
    width: 1536,
    height: 1024,
    bbox_coord_space: 'abs',
    bbox_format: 'xyxy',
    summary: { caption: 'A warm studio campaign for a ceramic cup.' },
    items: [
      { label: 'object', caption: 'An ivory ceramic cup.', bbox: [176, 224, 800, 864] },
      { label: 'text', caption: 'Dark green title.', text: '日常', bbox: [928, 272, 1408, 448] },
    ],
  };

  it('从代码块提取 Layout 草稿，按草稿尺寸归一化并同步画布', () => {
    const raw = '```json\n' + JSON.stringify(draft) + '\n```';
    const result = adapter.extract(raw, { canvasW: 1024, canvasH: 1024 });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.canvas).toEqual({ width: 1536, height: 1024 });
    expect(result.elements).toHaveLength(2);
    // x: 176/1536*1000 = 115, y: 224/1024*1000 = 219
    expect(result.elements[0].bbox).toEqual([219, 115, 844, 521]);
    expect(result.elements[1].type).toBe('text');
    expect(result.elements[1].text).toBe('日常');
  });

  it('toCopyText 输出编译后的单行模型 prompt', () => {
    const raw = JSON.stringify(draft);
    const result = adapter.extract(raw, { canvasW: 1024, canvasH: 1024 });
    if ('error' in result) throw new Error('extract failed');
    const text = adapter.toCopyText(result);
    expect(text.includes('\n')).toBe(false);
    expect(text).toContain('"bbox_coord_space":"abs_centralized"');
    expect(text).toContain('"bbox_format":"yxyx"');
  });

  it('尺寸不是 16 的倍数时报错', () => {
    const raw = JSON.stringify({ ...draft, width: 1000 });
    const result = adapter.extract(raw, { canvasW: 1024, canvasH: 1024 });
    expect('error' in result).toBe(true);
  });

  it('caption-only 输出返回 0 元素并告警"无 bbox"', () => {
    const result = adapter.extract(JSON.stringify({ caption: 'A calm photo.' }), { canvasW: 1024, canvasH: 1024 });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.elements).toEqual([]);
    expect(result.warnings.some(w => w.includes('bbox'))).toBe(true);
  });
});

describe('flux3-layout adapter', () => {
  const adapter = getAdapter('flux3-layout');
  const rows = [
    { id: 'background_1', bbox: [0, 0, 1000, 1000], desc: 'A warm ivory studio background.' },
    { id: 'bottle_1', bbox: [260, 130, 920, 520], desc: 'A frosted sage-green serum bottle.' },
  ];

  it('system prompt 声明正文 + JSON 数组契约并注入 skill 文本', () => {
    const prompt = adapter.buildSystemPrompt(makeSkill({ adapter: 'flux3-layout' }), { responseLang: 'zh' });
    expect(prompt).toContain('MARKER_SKILL_BODY');
    expect(prompt).toContain('0-1000');
    expect(prompt).toMatch(/\[top, left, bottom, right\]/);
    expect(prompt).toContain('你必须用中文回复。');
  });

  it('从 ```json 代码块提取 bbox 数组', () => {
    const raw = 'A studio product photograph <bottle_1>.\n\n```json\n' + JSON.stringify(rows) + '\n```';
    const result = adapter.extract(raw, { canvasW: 1024, canvasH: 1024 });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.adapter).toBe('flux3-layout');
    expect(result.elements).toHaveLength(2);
    expect(result.elements[0].bbox).toEqual([0, 0, 1000, 1000]);
    expect(result.elements[1].desc).toBe('A frosted sage-green serum bottle.');
    expect(result.elements.every(el => el.type === 'obj')).toBe(true);
    expect(adapter.toCopyText(result)).toBe(raw);
  });

  it('从裸数组（无围栏）提取', () => {
    const raw = JSON.stringify(rows);
    const result = adapter.extract(raw, { canvasW: 1024, canvasH: 1024 });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.elements).toHaveLength(2);
  });

  it('从正文末尾的平衡方括号数组提取', () => {
    const raw = 'A poster with <headline_1> at the top [not json] and more prose.\n'
      + JSON.stringify(rows)
      + '\nThanks!';
    const result = adapter.extract(raw, { canvasW: 1024, canvasH: 1024 });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.elements).toHaveLength(2);
    expect(result.elements[1].bbox).toEqual([260, 130, 920, 520]);
  });

  it('0-1 分数坐标会放大到 0-1000', () => {
    const raw = JSON.stringify([{ id: 'a', bbox: [0.1, 0.2, 0.3, 0.4], desc: 'd' }]);
    const result = adapter.extract(raw, { canvasW: 1024, canvasH: 1024 });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.elements[0].bbox).toEqual([100, 200, 300, 400]);
  });

  it('编辑行使用 tgt_bbox，删除行被跳过并告警', () => {
    const raw = JSON.stringify([
      { id: 'chair_1', from: 'ref_image_0', src_bbox: [350, 100, 750, 350], tgt_bbox: [200, 550, 600, 800], desc: 'a wooden chair' },
      { id: 'lamp_2', from: 'ref_image_0', src_bbox: [0, 0, 100, 100], tgt_bbox: null, desc: 'a floor lamp' },
    ]);
    const result = adapter.extract(raw, { canvasW: 1024, canvasH: 1024 });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].bbox).toEqual([200, 550, 600, 800]);
    expect(result.warnings.some(w => w.includes('lamp_2'))).toBe(true);
  });

  it('text 行映射为 text 元素并保留文字', () => {
    const raw = JSON.stringify([{ id: 'headline_1', type: 'text', text: 'NOVA', bbox: [80, 140, 200, 860], desc: 'Headline' }]);
    const result = adapter.extract(raw, { canvasW: 1024, canvasH: 1024 });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.elements[0].type).toBe('text');
    expect(result.elements[0].text).toBe('NOVA');
  });

  it('没有数组时返回 error 且保留原文', () => {
    const result = adapter.extract('这里没有 JSON 数组', { canvasW: 1024, canvasH: 1024 });
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.raw).toBe('这里没有 JSON 数组');
  });
});

describe('planSkillPrompt', () => {
  it('默认注入 SKILL.md 与全部 references', () => {
    const plan = planSkillPrompt(makeSkill());
    expect(plan.injected.map(f => f.path)).toEqual(['SKILL.md', 'references/schema.md']);
    expect(plan.skipped).toEqual([]);
  });

  it('enabledReferencePaths 只保留勾选的 reference（SKILL.md 始终注入）', () => {
    const plan = planSkillPrompt(makeSkill(), { enabledReferencePaths: [] });
    expect(plan.injected.map(f => f.path)).toEqual(['SKILL.md']);
    expect(plan.skipped).toEqual(['references/schema.md']);
  });

  it('超出预算时按优先级截断并报告 skipped', () => {
    const skill = makeSkill({
      files: [
        { path: 'SKILL.md', content: '# S\n\nbody' },
        { path: 'references/examples.md', content: 'x'.repeat(130_000) },
        { path: 'references/schema.md', content: 'MARKER_SCHEMA' },
      ],
    });
    const plan = planSkillPrompt(skill);
    expect(plan.injected.map(f => f.path)).toEqual(['SKILL.md', 'references/schema.md']);
    expect(plan.skipped).toEqual(['references/examples.md']);
  });

  it('renderSkillPrompt 拼接成带分隔标题的文本', () => {
    const plan = planSkillPrompt(makeSkill());
    const text = renderSkillPrompt(plan);
    expect(text).toContain('MARKER_SKILL_BODY');
    expect(text).toContain('references/schema.md');
    expect(text).toContain('MARKER_SCHEMA');
  });
});

describe('ideogram4 adapter', () => {
  const adapter = getAdapter('ideogram4');

  it('system prompt = 现有基础 prompt + skill 文本 + 语言提示', () => {
    const prompt = adapter.buildSystemPrompt(makeSkill(), { responseLang: 'en' });
    expect(prompt).toContain(CANVAS_CHAT_SYSTEM_PROMPT);
    expect(prompt).toContain('MARKER_SKILL_BODY');
    expect(prompt).toContain('MARKER_SCHEMA');
    expect(prompt).toContain('You MUST respond in English.');
  });

  it('提取 0-1000 bbox 的 JSON 并归一化为 yxyx', () => {
    const json = {
      high_level_description: 'A scene',
      style_description: {
        aesthetics: 'a', lighting: 'l', medium: 'photograph', photo: 'p', color_palette: ['#FFFFFF'],
      },
      compositional_deconstruction: {
        background: 'bg',
        elements: [
          { type: 'obj', bbox: [100, 200, 500, 800], desc: 'a cat' },
          { type: 'text', bbox: [600, 100, 700, 300], text: 'HELLO', desc: 'title' },
        ],
      },
    };
    const result = adapter.extract('```json\n' + JSON.stringify(json) + '\n```', { canvasW: 1024, canvasH: 1024 });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.adapter).toBe('ideogram4');
    expect(result.elements).toHaveLength(2);
    expect(result.elements[0].bbox).toEqual([100, 200, 500, 800]);
    expect(result.elements[1].text).toBe('HELLO');
    expect(result.globals?.background).toBe('bg');
    expect(result.ideogramOutput?.high_level_description).toBe('A scene');
  });

  it('0-1 分数坐标会被放大到 0-1000', () => {
    const json = {
      high_level_description: 'x',
      style_description: { aesthetics: 'a', lighting: 'l', color_palette: [] },
      compositional_deconstruction: {
        background: 'b',
        elements: [{ type: 'obj', bbox: [0.1, 0.2, 0.3, 0.4], desc: 'd' }],
      },
    };
    const result = adapter.extract(JSON.stringify(json), { canvasW: 1024, canvasH: 1024 });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.elements[0].bbox).toEqual([100, 200, 300, 400]);
  });

  it('像素坐标按画布尺寸归一化', () => {
    const json = {
      high_level_description: 'x',
      style_description: { aesthetics: 'a', lighting: 'l', color_palette: [] },
      compositional_deconstruction: {
        background: 'b',
        elements: [{ type: 'obj', bbox: [100, 200, 1500, 800], desc: 'd' }],
      },
    };
    const result = adapter.extract(JSON.stringify(json), { canvasW: 1000, canvasH: 2000 });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.elements[0].bbox).toEqual([50, 200, 750, 800]);
  });

  it('非法输出返回 error 而不是抛异常', () => {
    const result = adapter.extract('我觉得这张图应该很好看', { canvasW: 1024, canvasH: 1024 });
    expect('error' in result).toBe(true);
  });

  it('CJK text 元素解析成功并附带警告（不再阻断 Apply）', () => {
    const json = {
      high_level_description: '一张中文 UI 稿',
      style_description: { aesthetics: 'a', lighting: 'l', photo: 'p', medium: 'photograph', color_palette: [] },
      compositional_deconstruction: {
        background: 'bg',
        elements: [
          { type: 'text', bbox: [16, 110, 58, 330], text: '猫娘领养', desc: '搜索框占位文字' },
        ],
      },
    };
    const result = adapter.extract(JSON.stringify(json), { canvasW: 1024, canvasH: 1024 });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.elements[0].type).toBe('text');
    expect(result.elements[0].text).toBe('猫娘领养');
    expect(result.warnings.join(' ')).toContain('中日韩');
  });

  it('toCopyText 输出单行 JSON', () => {
    const json = {
      high_level_description: 'x',
      style_description: { aesthetics: 'a', lighting: 'l', color_palette: [] },
      compositional_deconstruction: {
        background: 'b',
        elements: [{ type: 'obj', bbox: [1, 2, 3, 4], desc: 'd' }],
      },
    };
    const result = adapter.extract(JSON.stringify(json), { canvasW: 1024, canvasH: 1024 });
    if ('error' in result) throw new Error('extract failed');
    const text = adapter.toCopyText(result);
    expect(text.includes('\n')).toBe(false);
    expect(text).toContain('"high_level_description":"x"');
  });
});

describe('none adapter', () => {
  const adapter = getAdapter('none');

  it('不产出 elements，只透传原始文本', () => {
    const result = adapter.extract('随便一段文字', { canvasW: 1024, canvasH: 1024 });
    expect('error' in result).toBe(true);
    expect(adapter.toCopyText({
      adapter: 'none',
      elements: [],
      raw: '随便一段文字',
      warnings: [],
    })).toBe('随便一段文字');
  });

  it('同样注入 SKILL.md、references 与语言提示', () => {
    const prompt = adapter.buildSystemPrompt(makeSkill({ adapter: 'none' }), { responseLang: 'en' });
    expect(prompt).toContain('MARKER_SKILL_BODY');
    expect(prompt).toContain('MARKER_SCHEMA');
    expect(prompt).toContain('You MUST respond in English.');
  });
});
