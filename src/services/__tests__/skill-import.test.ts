import { describe, it, expect } from 'vitest';

import { resolveGitHubTarget } from '../skill-import';

describe('resolveGitHubTarget', () => {
  it('raw.githubusercontent 链接直接使用', () => {
    const target = resolveGitHubTarget('https://raw.githubusercontent.com/a/b/main/SKILL.md');
    expect(target).toEqual({ kind: 'raw', url: 'https://raw.githubusercontent.com/a/b/main/SKILL.md' });
  });

  it('blob 链接转换为 raw 链接', () => {
    const target = resolveGitHubTarget('https://github.com/ruashots/ideogram4-skill/blob/master/SKILL.md');
    expect(target).toEqual({
      kind: 'raw',
      url: 'https://raw.githubusercontent.com/ruashots/ideogram4-skill/master/SKILL.md',
    });
  });

  it('仓库根链接解析为目录抓取', () => {
    const target = resolveGitHubTarget('https://github.com/OpenMOSS/MOSS-Image');
    expect(target).toEqual({
      kind: 'dir',
      apiUrl: 'https://api.github.com/repos/OpenMOSS/MOSS-Image/contents/?ref=',
      sourceUrl: 'https://github.com/OpenMOSS/MOSS-Image',
    });
  });

  it('tree 目录链接解析为带 ref 的目录抓取', () => {
    const target = resolveGitHubTarget('https://github.com/OpenMOSS/MOSS-Image/tree/main/skills/moss-image-prompt-enhancer');
    expect(target).toEqual({
      kind: 'dir',
      apiUrl: 'https://api.github.com/repos/OpenMOSS/MOSS-Image/contents/skills/moss-image-prompt-enhancer?ref=main',
      sourceUrl: 'https://github.com/OpenMOSS/MOSS-Image/tree/main/skills/moss-image-prompt-enhancer',
    });
  });

  it('非 GitHub 链接返回 null', () => {
    expect(resolveGitHubTarget('https://example.com/skill.md')).toBeNull();
    expect(resolveGitHubTarget('not a url')).toBeNull();
  });
});
