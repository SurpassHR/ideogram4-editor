import { describe, expect, it } from 'vitest';
import { translations, type Lang } from '../../i18n/translations';
import { createBuiltinPresets, type PromptPreset } from '../../types/presets';
import {
  getPresetDescription,
  getPresetName,
  getPresetTags,
} from '../preset-display';

function translator(lang: Lang) {
  return (path: string): string => {
    const value = path.split('.').reduce<unknown>((node, key) => {
      if (node == null || typeof node !== 'object') return undefined;
      return (node as Record<string, unknown>)[key];
    }, translations[lang]);
    return typeof value === 'string' ? value : path;
  };
}

describe('builtin preset i18n', () => {
  const builtins = createBuiltinPresets();

  it('localizes builtin name, description and tags in both languages', () => {
    const en = translator('en');
    const zh = translator('zh');

    expect(getPresetName(builtins[0], en)).toBe('Detail Enhancer');
    expect(getPresetDescription(builtins[0], en)).toContain('Ideogram 4');
    expect(getPresetTags(builtins[0], en)).toEqual(['Detail', 'English']);

    expect(getPresetName(builtins[0], zh)).toBe('增强细节描述');
    expect(getPresetDescription(builtins[0], zh)).toBe('增强视觉细节的英文描述，适合 Ideogram 4 图像生成');
    expect(getPresetTags(builtins[0], zh)).toEqual(['细节', '英文']);
  });

  it('keeps user preset text unchanged', () => {
    const preset: PromptPreset = {
      id: 'preset_custom',
      name: 'My Preset',
      description: 'My description',
      promptTemplate: 'Template',
      tags: ['custom'],
      createdAt: 1,
      updatedAt: 1,
    };
    const t = translator('zh');

    expect(getPresetName(preset, t)).toBe('My Preset');
    expect(getPresetDescription(preset, t)).toBe('My description');
    expect(getPresetTags(preset, t)).toEqual(['custom']);
  });
});
