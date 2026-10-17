import { describe, it, expect } from 'vitest';

import {
  MAX_SKILL_BYTES,
  detectAdapter,
  parseSkillFrontmatter,
  parseSkillPackage,
} from '../skill-parse';
import { getBuiltinSkills } from '../../skills/builtin-skills';

const FRONTMATTER_DOC = `---
name: my-cool-skill
description: 为 FLUX 3 Klein 生成带 bbox 的提示词
compatibility: Agent Skills 格式
metadata:
  author: someone
  version: '1.2.3'
---

# My Cool Skill

Body line one.

Body line two.
`;

describe('parseSkillFrontmatter', () => {
  it('解析扁平字段与 metadata 嵌套字段，并剥离引号', () => {
    const { data, body } = parseSkillFrontmatter(FRONTMATTER_DOC);
    expect(data.name).toBe('my-cool-skill');
    expect(data.description).toBe('为 FLUX 3 Klein 生成带 bbox 的提示词');
    expect(data['metadata.version']).toBe('1.2.3');
    expect(data['metadata.author']).toBe('someone');
    expect(body.startsWith('# My Cool Skill')).toBe(true);
  });

  it('无 frontmatter 时返回原文与空数据', () => {
    const { data, body } = parseSkillFrontmatter('# Plain\n\ntext');
    expect(data).toEqual({});
    expect(body).toBe('# Plain\n\ntext');
  });
});

describe('parseSkillPackage', () => {
  it('从文件列表构建 skill 记录，openai.yaml 提供展示名', () => {
    const result = parseSkillPackage({
      kind: 'files',
      sourceUrl: 'https://github.com/example/skill',
      files: [
        { path: 'references/zz.md', content: 'zz' },
        { path: 'SKILL.md', content: FRONTMATTER_DOC },
        { path: 'agents/openai.yaml', content: 'interface:\n  display_name: "My Cool Skill"\n  short_description: "bbox prompting"\n' },
        { path: 'references/aa.md', content: 'aa' },
        { path: 'scripts/run.py', content: 'print(1)' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.name).toBe('my-cool-skill');
    expect(result.displayName).toBe('My Cool Skill');
    expect(result.description).toBe('为 FLUX 3 Klein 生成带 bbox 的提示词');
    expect(result.version).toBe('1.2.3');
    expect(result.sourceUrl).toBe('https://github.com/example/skill');
    expect(result.files.map(f => f.path)).toEqual([
      'SKILL.md',
      'references/aa.md',
      'references/zz.md',
      'agents/openai.yaml',
    ]);
    expect(result.warnings.some(w => w.includes('scripts/run.py'))).toBe(true);
  });

  it('粘贴 Markdown 输入：无 frontmatter 时用 name 兜底并对缺失描述告警', () => {
    const result = parseSkillPackage({
      kind: 'markdown',
      name: 'pasted-skill',
      markdown: '# Pasted\n\nSome description line here.',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.name).toBe('pasted-skill');
    expect(result.displayName).toBe('pasted-skill');
    expect(result.description).toBe('Some description line here.');
    expect(result.warnings.some(w => w.includes('description'))).toBe(true);
  });

  it('从 LICENSE 文件识别许可证', () => {
    const result = parseSkillPackage({
      kind: 'files',
      files: [
        { path: 'SKILL.md', content: '---\nname: mit-skill\ndescription: d\n---\n\nbody' },
        { path: 'LICENSE', content: 'MIT License\n\nCopyright (c) 2026' },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.license).toBe('MIT');
  });

  it('包含 Markdown 之外的二进制文件时丢弃并告警', () => {
    const result = parseSkillPackage({
      kind: 'files',
      files: [
        { path: 'SKILL.md', content: '---\nname: bin-skill\ndescription: d\n---\n\nbody' },
        { path: 'references/blob.md', content: 'a\u0000b' },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.map(f => f.path)).toEqual(['SKILL.md']);
    expect(result.warnings.some(w => w.includes('references/blob.md'))).toBe(true);
  });

  it('没有任何 Markdown 时返回错误', () => {
    const result = parseSkillPackage({
      kind: 'files',
      files: [{ path: 'scripts/run.py', content: 'print(1)' }],
    });
    expect(result.ok).toBe(false);
  });

  it('超过单 skill 体积上限时返回错误而不是静默截断', () => {
    const huge = 'a'.repeat(MAX_SKILL_BYTES + 10);
    const result = parseSkillPackage({
      kind: 'files',
      files: [
        { path: 'SKILL.md', content: '---\nname: big\ndescription: d\n---\n\nbody' },
        { path: 'references/huge.md', content: huge },
      ],
    });
    expect(result.ok).toBe(false);
  });
});

describe('detectAdapter', () => {
  const files = (content: string) => [{ path: 'SKILL.md', content }];

  it('frontmatter 显式声明优先', () => {
    expect(detectAdapter({ name: 'x', description: 'moss image', files: files('adapter: moss-layout') }))
      .toBe('moss-layout');
  });

  it('名称/描述关键词命中', () => {
    expect(detectAdapter({ name: 'flux3-klein-prompting', description: 'prompting', files: files('') }))
      .toBe('flux3-layout');
    expect(detectAdapter({ name: 'moss-image-prompt-enhancer', description: '', files: files('') }))
      .toBe('moss-layout');
    expect(detectAdapter({ name: 'ideogram4', description: '', files: files('') }))
      .toBe('ideogram4');
  });

  it('正文特征探测', () => {
    expect(detectAdapter({
      name: 'unknown-a',
      description: '',
      files: files('bbox_coord_space must be "abs"'),
    })).toBe('moss-layout');
    expect(detectAdapter({
      name: 'unknown-b',
      description: '',
      files: files('Use <obj_1> and Flux3LayoutPrompt'),
    })).toBe('flux3-layout');
    expect(detectAdapter({
      name: 'unknown-c',
      description: '',
      files: files('"compositional_deconstruction" with elements'),
    })).toBe('ideogram4');
  });

  it('无法判断时降级为 none', () => {
    expect(detectAdapter({ name: 'whatever', description: 'generic tips', files: files('# tips') }))
      .toBe('none');
  });
});

describe('内置 skill', () => {
  it('包含三个上游快照，adapter 与许可正确', () => {
    const builtins = getBuiltinSkills();
    expect(builtins.map(s => s.id)).toEqual([
      'builtin:ideogram4',
      'builtin:flux3-layout',
      'builtin:moss-layout',
    ]);
    const byId = new Map(builtins.map(s => [s.id, s]));
    expect(byId.get('builtin:ideogram4')!.adapter).toBe('ideogram4');
    expect(byId.get('builtin:ideogram4')!.license).toBe('MIT');
    expect(byId.get('builtin:flux3-layout')!.adapter).toBe('flux3-layout');
    expect(byId.get('builtin:flux3-layout')!.license).toBe('Apache-2.0');
    expect(byId.get('builtin:moss-layout')!.adapter).toBe('moss-layout');
    expect(byId.get('builtin:moss-layout')!.license).toBe('Apache-2.0');
  });

  it('每个内置 skill 都带 SKILL.md 与至少一个 reference', () => {
    for (const skill of getBuiltinSkills()) {
      expect(skill.source).toBe('builtin');
      expect(skill.files[0].path).toBe('SKILL.md');
      expect(skill.files.some(f => f.path.startsWith('references/'))).toBe(true);
      expect(skill.files[0].content.length).toBeGreaterThan(100);
    }
  });
});
