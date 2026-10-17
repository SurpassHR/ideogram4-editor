/**
 * 从 GitHub 抓取 skill 包 — 支持 raw 文件链接、blob 文件链接、仓库根/目录链接。
 * 只抓取 SKILL.md / references/*.md / agents/*.yaml / LICENSE 这类文本文件。
 */

import type { SkillFile } from '../types/skill';

export type GitHubTarget =
  | { kind: 'raw'; url: string }
  | { kind: 'dir'; apiUrl: string; sourceUrl: string };

/** 把用户输入的 GitHub 链接解析成 raw 文件或目录抓取目标 */
export function resolveGitHubTarget(input: string): GitHubTarget | null {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.hostname === 'raw.githubusercontent.com') {
    return { kind: 'raw', url: trimmed };
  }
  if (url.hostname !== 'github.com') return null;

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo, kind, ...rest] = parts;

  if (kind === 'blob' && rest.length >= 2) {
    const [ref, ...pathParts] = rest;
    return {
      kind: 'raw',
      url: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${pathParts.join('/')}`,
    };
  }

  if (kind === 'tree') {
    const [ref, ...pathParts] = rest;
    return {
      kind: 'dir',
      apiUrl: `https://api.github.com/repos/${owner}/${repo}/contents/${pathParts.join('/')}?ref=${ref}`,
      sourceUrl: trimmed,
    };
  }

  return {
    kind: 'dir',
    apiUrl: `https://api.github.com/repos/${owner}/${repo}/contents/?ref=`,
    sourceUrl: trimmed,
  };
}

const INCLUDE_FILE_RE = /^(SKILL\.md|LICENSE(\.md|\.txt)?)$/i;
const INCLUDE_AGENT_RE = /\.ya?ml$/i;

interface GitHubEntry {
  type?: string;
  name?: string;
  path?: string;
  download_url?: string | null;
  url?: string;
}

export type SkillFetchResult =
  | { ok: true; files: SkillFile[]; sourceUrl: string }
  | { ok: false; error: string };

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** 抓取 skill 包文本（不落盘，直接返回内存中的文件列表） */
export async function fetchSkillFromUrl(input: string): Promise<SkillFetchResult> {
  const target = resolveGitHubTarget(input);
  if (!target) {
    return { ok: false, error: '仅支持 GitHub 仓库 / 文件链接（github.com 或 raw.githubusercontent.com）。' };
  }

  try {
    if (target.kind === 'raw') {
      const content = await fetchText(target.url);
      const name = target.url.split('/').pop() ?? 'SKILL.md';
      return { ok: true, files: [{ path: name, content }], sourceUrl: input.trim() };
    }

    const listing = await fetchJson(target.apiUrl);
    if (!Array.isArray(listing)) {
      return { ok: false, error: '目录列表解析失败。' };
    }

    const files: SkillFile[] = [];
    const pushFile = async (path: string, entry: GitHubEntry) => {
      if (!entry.download_url) return;
      files.push({ path, content: await fetchText(entry.download_url) });
    };

    for (const raw of listing as GitHubEntry[]) {
      const name = raw.name ?? '';
      if (raw.type === 'file' && INCLUDE_FILE_RE.test(name)) {
        await pushFile(name, raw);
      } else if (raw.type === 'dir' && name === 'agents') {
        const agentListing = await fetchJson(raw.url ?? '');
        if (Array.isArray(agentListing)) {
          for (const agentEntry of agentListing as GitHubEntry[]) {
            if (agentEntry.type === 'file' && INCLUDE_AGENT_RE.test(agentEntry.name ?? '')) {
              await pushFile(`agents/${agentEntry.name}`, agentEntry);
            }
          }
        }
      } else if (raw.type === 'dir' && name === 'references') {
        const refListing = await fetchJson(raw.url ?? '');
        if (Array.isArray(refListing)) {
          for (const refEntry of refListing as GitHubEntry[]) {
            if (refEntry.type === 'file' && /\.(md|txt)$/i.test(refEntry.name ?? '')) {
              await pushFile(`references/${refEntry.name}`, refEntry);
            }
          }
        }
      }
    }

    if (files.length === 0) {
      return { ok: false, error: '该目录下没有找到 SKILL.md。' };
    }
    return { ok: true, files, sourceUrl: input.trim() };
  } catch (error) {
    return { ok: false, error: `抓取失败：${error instanceof Error ? error.message : String(error)}` };
  }
}
