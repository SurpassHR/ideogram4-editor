/** system prompt 组装：skill 文本按预算与优先级注入。 */

import { SKILL_PROMPT_BUDGET } from '../../types/skill';
import type { SkillRecord } from '../../types/skill';
import type { SkillPromptPlan } from './types';

/** schema / layout / bounding-box 类参考文档优先注入 */
const PRIORITY_REFERENCE_RE = /(schema|layout|bounding-?box)/i;

/**
 * 计算要注入的 skill 文本：SKILL.md 始终注入，references 按优先级填充到预算上限。
 * 被勾选排除或超出预算的文件进入 skipped。
 */
export function planSkillPrompt(
  skill: SkillRecord,
  opts: { enabledReferencePaths?: string[] } = {},
): SkillPromptPlan {
  const mainFile = skill.files.find(f => f.path === 'SKILL.md');
  const references = skill.files.filter(f => f.path !== 'SKILL.md');
  const enabled = opts.enabledReferencePaths;
  const allowed = enabled
    ? references.filter(f => enabled.includes(f.path))
    : references;
  const disabled = references.filter(f => !allowed.includes(f)).map(f => f.path);

  const sorted = [...allowed].sort((a, b) => {
    const priorityA = PRIORITY_REFERENCE_RE.test(a.path) ? 0 : 1;
    const priorityB = PRIORITY_REFERENCE_RE.test(b.path) ? 0 : 1;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return a.path.localeCompare(b.path, 'en');
  });

  const injected = mainFile ? [mainFile] : [];
  const skipped = [...disabled];
  let totalChars = mainFile?.content.length ?? 0;

  for (const file of sorted) {
    if (totalChars + file.content.length > SKILL_PROMPT_BUDGET) {
      skipped.push(file.path);
      continue;
    }
    injected.push(file);
    totalChars += file.content.length;
  }

  return { skill, injected, skipped, totalChars };
}

/** 渲染注入块：SKILL.md 原样，references 加小标题 */
export function renderSkillPrompt(plan: SkillPromptPlan): string {
  return plan.injected
    .map(file => (file.path === 'SKILL.md'
      ? file.content
      : `### Injected reference: ${file.path}\n\n${file.content}`))
    .join('\n\n---\n\n');
}

/** 语言偏好提示（与既有 Canvas Chat 文本保持一致） */
export function buildLangHint(responseLang?: string): string {
  if (responseLang === 'en') {
    return 'You MUST respond in English. Provide all text descriptions (high_level_description, element desc, background, etc.) in English.';
  }
  if (responseLang === 'zh') {
    return '你必须用中文回复。所有描述字段（high_level_description、element desc、background 等）都必须使用中文。';
  }
  return 'Respond in the same language the user uses. All description fields should match the user\'s language.';
}

/** 基础 prompt + skill 文本 + 语言提示 */
export function composeSystemPrompt(
  base: string,
  skill: SkillRecord,
  opts: { responseLang?: string; enabledReferencePaths?: string[] } = {},
): string {
  const plan = planSkillPrompt(skill, { enabledReferencePaths: opts.enabledReferencePaths });
  const skillBlock = [
    `## Active skill: ${skill.displayName} (${skill.name})`,
    renderSkillPrompt(plan),
  ].join('\n\n');
  const skippedNotice = plan.skipped.length > 0
    ? `\n\n(Skipped skill references: ${plan.skipped.join(', ')})`
    : '';
  return [base, skillBlock, buildLangHint(opts.responseLang) + skippedNotice].join('\n\n');
}
