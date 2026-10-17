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
      'ideogram4',
      'none',
    ]);
    expect(getAdapter('ideogram4').label).toBe('Ideogram 4 JSON');
    expect(getAdapter('none').label).toBe('Plain text');
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
});
