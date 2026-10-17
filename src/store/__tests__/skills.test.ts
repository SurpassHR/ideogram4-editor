import { describe, it, expect, beforeEach } from 'vitest';

import { useEditorStore } from '../index';
import { DEFAULT_SKILL_ID, SKILLS_STORAGE_KEY, SKILL_PREFS_STORAGE_KEY, resolveActiveSkill } from '../../types/skill';
import { getBuiltinSkills } from '../../skills/builtin-skills';

const IDEogram_SKILL_MD = '---\nname: imported-ideo\ndescription: ideogram json\n---\n\n# Body';

describe('skills store', () => {
  beforeEach(() => {
    localStorage.clear();
    useEditorStore.setState({
      importedSkills: [],
      skillPrefs: { activeSkillId: DEFAULT_SKILL_ID, overrides: {} },
      pendingApply: null,
    });
  });

  it('importSkill 解析并写入 state 与 localStorage', () => {
    const result = useEditorStore.getState().importSkill({ kind: 'markdown', markdown: IDEogram_SKILL_MD });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skill.id.startsWith('skill_')).toBe(true);
    expect(result.skill.source).toBe('imported');
    expect(result.skill.adapter).toBe('ideogram4');
    expect(result.skill.adapterConfirmed).toBe(false);

    const state = useEditorStore.getState();
    expect(state.importedSkills).toHaveLength(1);
    const stored = JSON.parse(localStorage.getItem(SKILLS_STORAGE_KEY) ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('imported-ideo');
  });

  it('importSkill 解析失败时返回错误且不写入', () => {
    const result = useEditorStore.getState().importSkill({ kind: 'files', files: [] });
    expect(result.ok).toBe(false);
    expect(useEditorStore.getState().importedSkills).toHaveLength(0);
    expect(localStorage.getItem(SKILLS_STORAGE_KEY)).toBeNull();
  });

  it('deleteSkill 只删除导入项，内置 skill 不受影响', () => {
    const imported = useEditorStore.getState().importSkill({ kind: 'markdown', markdown: IDEogram_SKILL_MD });
    if (!imported.ok) throw new Error('import failed');

    useEditorStore.getState().deleteSkill(imported.skill.id);
    expect(useEditorStore.getState().importedSkills).toHaveLength(0);

    useEditorStore.getState().deleteSkill(DEFAULT_SKILL_ID);
    expect(getBuiltinSkills().some(s => s.id === DEFAULT_SKILL_ID)).toBe(true);
  });

  it('setActiveSkill 持久化到 skillPrefs', () => {
    useEditorStore.getState().setActiveSkill('builtin:moss-layout');
    expect(useEditorStore.getState().skillPrefs.activeSkillId).toBe('builtin:moss-layout');
    const stored = JSON.parse(localStorage.getItem(SKILL_PREFS_STORAGE_KEY) ?? '{}');
    expect(stored.activeSkillId).toBe('builtin:moss-layout');
  });

  it('updateSkillPref 保存 adapter 覆盖并标记为已确认', () => {
    const imported = useEditorStore.getState().importSkill({ kind: 'markdown', markdown: IDEogram_SKILL_MD });
    if (!imported.ok) throw new Error('import failed');

    useEditorStore.getState().updateSkillPref(imported.skill.id, { adapter: 'none' });
    useEditorStore.getState().setActiveSkill(imported.skill.id);
    const state = useEditorStore.getState();
    expect(state.skillPrefs.overrides[imported.skill.id].adapter).toBe('none');
    expect(state.importedSkills[0].adapterConfirmed).toBe(true);

    const all = [...getBuiltinSkills(), ...state.importedSkills];
    expect(resolveActiveSkill(all, state.skillPrefs).adapter).toBe('none');
  });

  it('updateSkillPref 保存 reference 勾选', () => {
    const imported = useEditorStore.getState().importSkill({
      kind: 'files',
      files: [
        { path: 'SKILL.md', content: IDEogram_SKILL_MD },
        { path: 'references/a.md', content: 'a' },
      ],
    });
    if (!imported.ok) throw new Error('import failed');
    useEditorStore.getState().updateSkillPref(imported.skill.id, { enabledReferencePaths: ['references/a.md'] });
    expect(useEditorStore.getState().skillPrefs.overrides[imported.skill.id].enabledReferencePaths)
      .toEqual(['references/a.md']);
  });

  it('resolveActiveSkill 在指针失效时回落到默认 skill', () => {
    useEditorStore.setState({ skillPrefs: { activeSkillId: 'skill_missing', overrides: {} } });
    const state = useEditorStore.getState();
    const resolved = resolveActiveSkill([...getBuiltinSkills(), ...state.importedSkills], state.skillPrefs);
    expect(resolved.id).toBe(DEFAULT_SKILL_ID);
  });

  it('replaceImportedSkills 替换导入项并持久化（备份恢复用）', () => {
    const imported = useEditorStore.getState().importSkill({ kind: 'markdown', markdown: IDEogram_SKILL_MD });
    if (!imported.ok) throw new Error('import failed');

    useEditorStore.getState().replaceImportedSkills([]);
    expect(useEditorStore.getState().importedSkills).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(SKILLS_STORAGE_KEY) ?? '[]')).toEqual([]);
  });

  it('pendingApply 可设置与清空', () => {
    useEditorStore.getState().setPendingApply({
      skillId: DEFAULT_SKILL_ID,
      adapter: 'ideogram4',
      extraction: { adapter: 'ideogram4', elements: [], raw: 'x', warnings: [] },
    });
    expect(useEditorStore.getState().pendingApply?.skillId).toBe(DEFAULT_SKILL_ID);
    useEditorStore.getState().setPendingApply(null);
    expect(useEditorStore.getState().pendingApply).toBeNull();
  });
});
