/**
 * 一次性迁移：画布级自定义 system prompt → skill。
 * Canvas Chat 由 skill 接管后，`scope` 为 canvas/both 的旧条目会转成
 * adapter=ideogram4 的导入 skill（内容原样保留），Box 作用域条目不受影响。
 */

import type { SystemPromptEntry } from '../types/chat';
import type { SkillRecord } from '../types/skill';

export const MIGRATED_SKILL_ID_PREFIX = 'skill_migrated_';

export interface SkillMigrationInput {
  systemPrompts: SystemPromptEntry[];
  activeCanvasChatSystemPromptId: string | null;
  activeBoxChatSystemPromptId: string | null;
  alreadyMigrated: boolean;
  importedSkills: SkillRecord[];
}

export interface SkillMigrationResult {
  migrated: boolean;
  /** 全部导入 skill（原有 + 迁移生成的） */
  converted: SkillRecord[];
  /** 迁移后剩余的 system prompt（仅 box） */
  systemPrompts: SystemPromptEntry[];
  activeCanvasChatSystemPromptId: string | null;
  activeBoxChatSystemPromptId: string | null;
  /** 需要写入 skillPrefs.activeSkillId 的值；null 表示保持默认 */
  activeSkillId: string | null;
}

function toSkill(entry: SystemPromptEntry): SkillRecord {
  return {
    id: `${MIGRATED_SKILL_ID_PREFIX}${entry.id}`,
    name: entry.name,
    displayName: entry.name,
    description: '由画布级自定义 system prompt 迁移而来。',
    source: 'imported',
    sourceUrl: null,
    license: null,
    version: null,
    adapter: 'ideogram4',
    adapterConfirmed: true,
    files: [{ path: 'SKILL.md', content: entry.content }],
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export function migrateCanvasSystemPrompts(input: SkillMigrationInput): SkillMigrationResult {
  if (input.alreadyMigrated) {
    return {
      migrated: false,
      converted: input.importedSkills,
      systemPrompts: input.systemPrompts,
      activeCanvasChatSystemPromptId: input.activeCanvasChatSystemPromptId,
      activeBoxChatSystemPromptId: input.activeBoxChatSystemPromptId,
      activeSkillId: null,
    };
  }

  const canvasEntries = input.systemPrompts.filter(p => p.scope !== 'box');
  if (canvasEntries.length === 0) {
    return {
      migrated: false,
      converted: input.importedSkills,
      systemPrompts: input.systemPrompts,
      activeCanvasChatSystemPromptId: input.activeCanvasChatSystemPromptId,
      activeBoxChatSystemPromptId: input.activeBoxChatSystemPromptId,
      activeSkillId: null,
    };
  }

  const convertedIds = new Set(canvasEntries.map(entry => entry.id));
  const migratedSkills = canvasEntries.map(toSkill);
  const activeCanvasId = input.activeCanvasChatSystemPromptId;
  const activeBoxId = input.activeBoxChatSystemPromptId;

  return {
    migrated: true,
    converted: [...input.importedSkills, ...migratedSkills],
    systemPrompts: input.systemPrompts.filter(p => p.scope === 'box'),
    activeCanvasChatSystemPromptId: activeCanvasId && convertedIds.has(activeCanvasId) ? null : activeCanvasId,
    activeBoxChatSystemPromptId: activeBoxId && convertedIds.has(activeBoxId) ? null : activeBoxId,
    activeSkillId: activeCanvasId && convertedIds.has(activeCanvasId)
      ? `${MIGRATED_SKILL_ID_PREFIX}${activeCanvasId}`
      : null,
  };
}
