import { describe, it, expect } from 'vitest';

import { MIGRATED_SKILL_ID_PREFIX, migrateCanvasSystemPrompts } from '../skill-migration';
import type { SystemPromptEntry } from '../../types/chat';

const entry = (id: string, scope: SystemPromptEntry['scope'], name = id): SystemPromptEntry => ({
  id,
  name,
  content: `CONTENT_${id}`,
  scope,
  createdAt: 1,
  updatedAt: 2,
});

const baseInput = {
  systemPrompts: [
    entry('sp_canvas', 'canvas', '画布构图提示'),
    entry('sp_box', 'box'),
    entry('sp_both', 'both'),
  ],
  activeCanvasChatSystemPromptId: 'sp_canvas',
  activeBoxChatSystemPromptId: 'sp_box',
  alreadyMigrated: false,
  importedSkills: [],
};

describe('migrateCanvasSystemPrompts', () => {
  it('把 canvas/both 条目转成 ideogram4 skill，box 条目原样保留', () => {
    const result = migrateCanvasSystemPrompts(baseInput);
    expect(result.migrated).toBe(true);
    expect(result.systemPrompts.map(p => p.id)).toEqual(['sp_box']);
    expect(result.converted.map(s => s.id)).toEqual([
      `${MIGRATED_SKILL_ID_PREFIX}sp_canvas`,
      `${MIGRATED_SKILL_ID_PREFIX}sp_both`,
    ]);
    expect(result.converted[0].adapter).toBe('ideogram4');
    expect(result.converted[0].source).toBe('imported');
    expect(result.converted[0].displayName).toBe('画布构图提示');
    expect(result.converted[0].files[0]).toEqual({ path: 'SKILL.md', content: 'CONTENT_sp_canvas' });
    expect(result.converted[0].createdAt).toBe(1);
  });

  it('旧的活动指针转移到迁移后的 skill', () => {
    const result = migrateCanvasSystemPrompts(baseInput);
    expect(result.activeSkillId).toBe(`${MIGRATED_SKILL_ID_PREFIX}sp_canvas`);
    expect(result.activeCanvasChatSystemPromptId).toBeNull();
  });

  it('已迁移过时保持原状（幂等）', () => {
    const result = migrateCanvasSystemPrompts({ ...baseInput, alreadyMigrated: true });
    expect(result.migrated).toBe(false);
    expect(result.converted).toEqual([]);
    expect(result.systemPrompts.map(p => p.id)).toEqual(['sp_canvas', 'sp_box', 'sp_both']);
    expect(result.activeSkillId).toBeNull();
  });

  it('没有任何 canvas/both 条目时不产生迁移', () => {
    const result = migrateCanvasSystemPrompts({
      ...baseInput,
      systemPrompts: [entry('sp_box', 'box')],
      activeCanvasChatSystemPromptId: null,
    });
    expect(result.migrated).toBe(false);
    expect(result.systemPrompts.map(p => p.id)).toEqual(['sp_box']);
  });

  it('box 指针指向被迁移的 both 条目时被清空', () => {
    const result = migrateCanvasSystemPrompts({
      ...baseInput,
      activeBoxChatSystemPromptId: 'sp_both',
    });
    expect(result.activeBoxChatSystemPromptId).toBeNull();
    expect(result.systemPrompts.map(p => p.id)).toEqual(['sp_box']);
  });

  it('保留已有的导入 skill', () => {
    const existing = {
      id: 'skill_existing',
      name: 'existing',
      displayName: 'Existing',
      description: '',
      source: 'imported' as const,
      sourceUrl: null,
      license: null,
      version: null,
      adapter: 'none' as const,
      adapterConfirmed: false,
      files: [{ path: 'SKILL.md', content: 'x' }],
      createdAt: 0,
      updatedAt: 0,
    };
    const result = migrateCanvasSystemPrompts({ ...baseInput, importedSkills: [existing] });
    expect(result.converted.map(s => s.id)).toContain('skill_existing');
    expect(result.converted).toHaveLength(3);
  });
});
