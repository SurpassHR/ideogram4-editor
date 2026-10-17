/** Skill（Agent Skill 兼容包）类型定义。 */

/** 输出格式适配器标识 */
export type SkillAdapterId = 'ideogram4' | 'flux3-layout' | 'moss-layout' | 'none';

export const SKILL_ADAPTER_IDS: readonly SkillAdapterId[] = [
  'ideogram4',
  'flux3-layout',
  'moss-layout',
  'none',
];

export function isSkillAdapterId(value: unknown): value is SkillAdapterId {
  return typeof value === 'string' && (SKILL_ADAPTER_IDS as readonly string[]).includes(value);
}

/** skill 包内的单个文本文件 */
export interface SkillFile {
  /** 包内相对路径，主文档固定为 `SKILL.md` */
  path: string;
  content: string;
}

/** 一条 skill 记录（内置或用户导入） */
export interface SkillRecord {
  /** `builtin:<name>` 或 `skill_<ts>_<rand>` */
  id: string;
  /** frontmatter.name / 目录名兜底 */
  name: string;
  /** agents/openai.yaml 的 display_name，缺省回落到 name */
  displayName: string;
  description: string;
  source: 'builtin' | 'imported';
  sourceUrl: string | null;
  license: string | null;
  version: string | null;
  adapter: SkillAdapterId;
  /** 用户是否确认过自动探测的 adapter */
  adapterConfirmed: boolean;
  files: SkillFile[];
  createdAt: number;
  updatedAt: number;
}

/** 用户对 skill 的偏好与覆盖 */
export interface SkillPrefs {
  /** 当前用于 Canvas Chat 的 skill id */
  activeSkillId: string;
  /** 按 skill id 保存的覆盖项 */
  overrides: Record<string, {
    adapter?: SkillAdapterId;
    enabledReferencePaths?: string[];
  }>;
}

/** 默认 skill（与今天硬编码行为的等价物） */
export const DEFAULT_SKILL_ID = 'builtin:ideogram4';

export const SKILLS_STORAGE_KEY = 'ideogram4-skills';
export const SKILL_PREFS_STORAGE_KEY = 'ideogram4-skill-prefs';
export const SKILL_MIGRATION_STORAGE_KEY = 'ideogram4-skill-migration-v1';

/** 单个 skill 的体积上限（字符数，约等于 UTF-8 字节数的下界） */
export const MAX_SKILL_BYTES = 1_500_000;
/** 全部导入 skill 的体积上限 */
export const MAX_TOTAL_SKILL_BYTES = 4_000_000;
/** 注入 system prompt 的 skill 文本预算（字符数） */
export const SKILL_PROMPT_BUDGET = 120_000;

export function createEmptySkillPrefs(): SkillPrefs {
  return { activeSkillId: DEFAULT_SKILL_ID, overrides: {} };
}
