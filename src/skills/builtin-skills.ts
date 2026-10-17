/**
 * 内置 skill 快照 — 文本逐字节来自上游仓库（见 THIRD_PARTY_NOTICES.md），
 * 通过 Vite `?raw` 在构建时内联，不写入 localStorage。
 */

import ideogram4SkillMd from './ideogram4/SKILL.md?raw';
import ideogram4Schema from './ideogram4/references/schema.md?raw';
import flux3SkillMd from './flux3-layout/SKILL.md?raw';
import flux3BoundingBox from './flux3-layout/references/bounding-box-workflow.md?raw';
import mossSkillMd from './moss-layout/SKILL.md?raw';
import mossLayout from './moss-layout/references/layout.md?raw';
import type { SkillRecord } from '../types/skill';

/** 内置 skill 的固定时间戳（快照日期），避免每次启动产生 diff */
const BUILTIN_TIMESTAMP = Date.parse('2026-10-17T00:00:00Z');

export const BUILTIN_SKILLS: SkillRecord[] = [
  {
    id: 'builtin:ideogram4',
    name: 'ideogram4',
    displayName: 'Ideogram 4 JSON Caption',
    description: '结构化 JSON caption（bbox [y,x,y,x] 0-1000，键序严格，photo XOR art_style），来自 ruashots/ideogram4-skill（MIT）。',
    source: 'builtin',
    sourceUrl: 'https://github.com/ruashots/ideogram4-skill',
    license: 'MIT',
    version: null,
    adapter: 'ideogram4',
    adapterConfirmed: true,
    files: [
      { path: 'SKILL.md', content: ideogram4SkillMd },
      { path: 'references/schema.md', content: ideogram4Schema },
    ],
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP,
  },
  {
    id: 'builtin:flux3-layout',
    name: 'flux3-klein-prompting',
    displayName: 'FLUX 3 Klein Layout',
    description: '完整画面正文 + 末尾 JSON 数组（bbox [top,left,bottom,right] 0-1000），来自 AI-KSK/flux3-klein-prompting（Apache-2.0）。',
    source: 'builtin',
    sourceUrl: 'https://github.com/AI-KSK/flux3-klein-prompting',
    license: 'Apache-2.0',
    version: '1.1.0',
    adapter: 'flux3-layout',
    adapterConfirmed: true,
    files: [
      { path: 'SKILL.md', content: flux3SkillMd },
      { path: 'references/bounding-box-workflow.md', content: flux3BoundingBox },
    ],
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP,
  },
  {
    id: 'builtin:moss-layout',
    name: 'moss-image-prompt-enhancer',
    displayName: 'MOSS-Image Layout',
    description: 'caption 或像素 Layout 草稿（xyxy，画布尺寸为 16 的倍数），来自 OpenMOSS/MOSS-Image 官方 skills（Apache-2.0）。',
    source: 'builtin',
    sourceUrl: 'https://github.com/OpenMOSS/MOSS-Image/tree/main/skills/moss-image-prompt-enhancer',
    license: 'Apache-2.0',
    version: null,
    adapter: 'moss-layout',
    adapterConfirmed: true,
    files: [
      { path: 'SKILL.md', content: mossSkillMd },
      { path: 'references/layout.md', content: mossLayout },
    ],
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP,
  },
];

export function getBuiltinSkills(): SkillRecord[] {
  return BUILTIN_SKILLS.map(skill => ({
    ...skill,
    files: skill.files.map(file => ({ ...file })),
  }));
}
