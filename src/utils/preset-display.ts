import type { BuiltinPresetKey, PromptPreset } from '../types/presets';

type Translator = (path: string, vars?: Record<string, string | number>) => string;

type BuiltinPresetTagKey =
  | 'detail'
  | 'english'
  | 'chinese'
  | 'general'
  | 'scene'
  | 'atmosphere'
  | 'character';

const BUILTIN_PRESET_TAG_KEYS: Record<BuiltinPresetKey, BuiltinPresetTagKey[]> = {
  detailEnhancer: ['detail', 'english'],
  chinesePrompt: ['chinese', 'general'],
  sceneAtmosphere: ['scene', 'atmosphere'],
  characterDetail: ['character', 'detail'],
};

/** 预设名称：内置预设跟随界面语言，用户预设使用自身文案 */
export function getPresetName(preset: PromptPreset, t: Translator): string {
  return preset.builtinKey
    ? t(`chat.builtinPresets.${preset.builtinKey}.name`)
    : preset.name;
}

/** 预设描述：内置预设跟随界面语言，用户预设使用自身文案 */
export function getPresetDescription(preset: PromptPreset, t: Translator): string {
  return preset.builtinKey
    ? t(`chat.builtinPresets.${preset.builtinKey}.description`)
    : preset.description;
}

/** 预设标签：内置预设跟随界面语言，用户预设使用自身标签 */
export function getPresetTags(preset: PromptPreset, t: Translator): string[] {
  if (!preset.builtinKey) return preset.tags;
  const tagKeys = BUILTIN_PRESET_TAG_KEYS[preset.builtinKey] ?? [];
  return tagKeys.map((key) => t(`chat.builtinPresets.tags.${key}`));
}
