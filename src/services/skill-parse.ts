/**
 * Skill 包解析 — 零依赖解析 SKILL.md frontmatter、agents/openai.yaml，
 * 归集 references、探测输出 adapter 并执行体积校验。
 */

import type { SkillAdapterId, SkillFile } from '../types/skill';
import { MAX_SKILL_BYTES, isSkillAdapterId } from '../types/skill';

export { MAX_SKILL_BYTES, MAX_TOTAL_SKILL_BYTES } from '../types/skill';

export type SkillPackageInput =
  | { kind: 'files'; files: SkillFile[]; sourceUrl?: string | null }
  | { kind: 'markdown'; markdown: string; name?: string; sourceUrl?: string | null };

export interface ParsedSkillPackage {
  ok: true;
  name: string;
  displayName: string;
  description: string;
  version: string | null;
  license: string | null;
  sourceUrl: string | null;
  adapter: SkillAdapterId;
  files: SkillFile[];
  warnings: string[];
  totalBytes: number;
}

export type ParseSkillResult = ParsedSkillPackage | { ok: false; error: string };

const DESCRIPTION_FALLBACK_LIMIT = 160;

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

/**
 * 解析 YAML 子集：顶层 `key: value` + 一层嵌套 `section:` 下的 `key: value`。
 * 仅覆盖 skill frontmatter / openai.yaml 需要的形态，不引入 YAML 依赖。
 */
function parseSimpleYaml(yaml: string): Record<string, string> {
  const data: Record<string, string> = {};
  let section: string | null = null;

  for (const rawLine of yaml.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const indent = rawLine.match(/^[ \t]*/)?.[0].length ?? 0;
    const line = rawLine.trim();
    const sep = line.indexOf(':');
    if (sep <= 0) continue;

    const key = line.slice(0, sep).trim();
    const value = stripQuotes(line.slice(sep + 1));

    if (indent === 0) {
      if (!value) {
        section = key;
        continue;
      }
      section = null;
      data[key] = value;
    } else if (section) {
      data[`${section}.${key}`] = value;
    }
  }

  return data;
}

/** 拆分 SKILL.md 的 frontmatter 与正文 */
export function parseSkillFrontmatter(markdown: string): {
  data: Record<string, string>;
  body: string;
} {
  const text = markdown.replace(/^\uFEFF/, '');
  const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (!match) return { data: {}, body: text };
  const body = text.slice(match[0].length).replace(/^(?:[ \t]*\r?\n)+/, '');
  return { data: parseSimpleYaml(match[1]), body };
}

/** 解析 agents/openai.yaml 的 interface 段 */
export function parseOpenAiInterface(yaml: string): {
  displayName: string | null;
  shortDescription: string | null;
  defaultPrompt: string | null;
} {
  const data = parseSimpleYaml(yaml);
  return {
    displayName: data['interface.display_name'] || null,
    shortDescription: data['interface.short_description'] || null,
    defaultPrompt: data['interface.default_prompt'] || null,
  };
}

function normalizeSkillPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

/** 所有路径共享同一个顶层目录时剥离它（对应"选择整个 skill 文件夹"上传） */
function stripCommonRoot(files: SkillFile[]): SkillFile[] {
  if (files.length === 0) return files;
  const roots = new Set(files.map(f => f.path.split('/')[0]));
  if (roots.size !== 1) return files;
  const root = [...roots][0];
  if (files.some(f => f.path === root)) return files;
  return files.map(f => ({ ...f, path: f.path.slice(root.length + 1) }));
}

function isKeptPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower === 'skill.md') return true;
  if (lower.startsWith('references/')) return true;
  if (lower.startsWith('agents/') && lower.endsWith('.yaml')) return true;
  return /^license(\.md|\.txt)?$/.test(lower);
}

function pathRank(path: string): number {
  const lower = path.toLowerCase();
  if (lower === 'skill.md') return 0;
  if (lower.startsWith('references/')) return 1;
  if (lower.startsWith('agents/')) return 2;
  return 3;
}

function pickDescription(
  frontmatter: Record<string, string>,
  body: string,
): { description: string; warning: string | null } {
  const declared = frontmatter.description?.trim();
  if (declared) return { description: declared, warning: null };

  const lines = body.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  const proseLine = lines.find(line => !line.startsWith('#')) ?? '';
  const fallbackSource = proseLine || (lines[0] ?? '').replace(/^#+\s*/, '');
  return {
    description: fallbackSource.slice(0, DESCRIPTION_FALLBACK_LIMIT),
    warning: 'skill 缺少 description 字段，已用正文首行兜底。',
  };
}

function detectLicense(frontmatter: Record<string, string>, files: SkillFile[]): string | null {
  const declared = frontmatter.license?.trim() || frontmatter['metadata.license']?.trim();
  if (declared) return declared;

  const licenseFile = files.find(f => /^license(\.md|\.txt)?$/i.test(f.path));
  if (!licenseFile) return null;
  if (/Apache License/i.test(licenseFile.content)) return 'Apache-2.0';
  if (/MIT License|Permission is hereby granted, free of charge/i.test(licenseFile.content)) return 'MIT';
  return null;
}

/** 依据显式声明 → 名称/描述关键词 → 正文特征 的顺序探测输出 adapter */
export function detectAdapter(input: {
  name: string;
  description: string;
  files: SkillFile[];
}): SkillAdapterId {
  const skillMd = input.files.find(f => f.path.toLowerCase() === 'skill.md')?.content ?? '';
  const { data } = parseSkillFrontmatter(skillMd);
  const declared = (data.adapter || '').trim();
  if (isSkillAdapterId(declared)) return declared;
  if (isSkillAdapterId(input.name.trim())) return input.name.trim() as SkillAdapterId;

  const haystack = `${input.name}\n${input.description}`.toLowerCase();
  if (/flux\s*3|flux3|klein/.test(haystack)) return 'flux3-layout';
  if (/moss/.test(haystack)) return 'moss-layout';
  if (/ideogram/.test(haystack)) return 'ideogram4';

  const corpus = input.files.map(f => f.content).join('\n');
  if (/bbox_coord_space|abs_centralized/.test(corpus)) return 'moss-layout';
  if (/compositional_deconstruction/.test(corpus)) return 'ideogram4';
  if (/<obj_1>|Flux3LayoutPrompt|src_bbox/.test(corpus)) return 'flux3-layout';

  return 'none';
}

function skillNameFromFiles(files: SkillFile[], nameHint?: string): string {
  const hint = nameHint?.trim();
  if (hint) return hint;
  const source = files.find(f => f.path === 'SKILL.md')?.path ?? files[0]?.path ?? '';
  const base = source.split('/').filter(Boolean).slice(-1)[0] ?? '';
  const normalized = base
    .replace(/\.md$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'imported-skill';
}

/** 解析一个 skill 包（文件列表或粘贴的 Markdown） */
export function parseSkillPackage(input: SkillPackageInput): ParseSkillResult {
  const rawFiles: SkillFile[] = input.kind === 'files'
    ? input.files.map(f => ({ path: f.path, content: f.content }))
    : [{ path: 'SKILL.md', content: input.markdown }];
  const sourceUrl = input.sourceUrl ?? null;

  const normalizedInput = stripCommonRoot(
    rawFiles
      .map(f => ({ path: normalizeSkillPath(f.path), content: f.content }))
      .filter(f => f.path.length > 0),
  );

  if (normalizedInput.length === 0) {
    return { ok: false, error: '没有可解析的文件。' };
  }

  const warnings: string[] = [];
  const kept: SkillFile[] = [];
  const dropped: string[] = [];
  for (const file of normalizedInput) {
    if (!isKeptPath(file.path) || file.content.includes('\0')) {
      dropped.push(file.path);
      continue;
    }
    kept.push({
      path: file.path.toLowerCase() === 'skill.md' ? 'SKILL.md' : file.path,
      content: file.content,
    });
  }
  if (dropped.length > 0) {
    warnings.push(`已忽略非 skill 文本文件：${dropped.join(', ')}`);
  }

  const markdownCandidates = kept.filter(f => /\.md$/i.test(f.path));
  let mainFile = kept.find(f => f.path === 'SKILL.md');
  if (!mainFile && markdownCandidates.length === 1) {
    const only = markdownCandidates[0];
    const renamed: SkillFile = { ...only, path: 'SKILL.md' };
    kept[kept.indexOf(only)] = renamed;
    mainFile = renamed;
  }
  if (!mainFile) {
    return { ok: false, error: '未找到 SKILL.md（或唯一的 Markdown 文件）。' };
  }

  const totalBytes = kept.reduce((sum, f) => sum + f.content.length, 0);
  if (totalBytes > MAX_SKILL_BYTES) {
    return {
      ok: false,
      error: `skill 体积超限：${totalBytes} 字符 > 上限 ${MAX_SKILL_BYTES} 字符。`,
    };
  }

  const sorted = [...kept].sort((a, b) => {
    const rankDiff = pathRank(a.path) - pathRank(b.path);
    if (rankDiff !== 0) return rankDiff;
    return a.path.localeCompare(b.path, 'en');
  });

  const { data, body } = parseSkillFrontmatter(mainFile.content);
  const name = (data.name || '').trim()
    || skillNameFromFiles(sorted, input.kind === 'markdown' ? input.name : undefined);
  const { description, warning: descriptionWarning } = pickDescription(data, body);
  if (descriptionWarning) warnings.push(descriptionWarning);

  const openAiFile = sorted.find(f => f.path.toLowerCase() === 'agents/openai.yaml');
  const displayName = openAiFile
    ? parseOpenAiInterface(openAiFile.content).displayName ?? name
    : name;

  const adapter = detectAdapter({ name, description, files: sorted });
  if (adapter === 'none') {
    warnings.push('未能自动识别输出格式（adapter），默认按纯文本处理，可在 skill 详情中手动指定。');
  }

  return {
    ok: true,
    name,
    displayName,
    description,
    version: (data['metadata.version'] || data.version || '').trim() || null,
    license: detectLicense(data, sorted),
    sourceUrl,
    adapter,
    files: sorted,
    warnings,
    totalBytes,
  };
}
