/** adapter 注册表 — 按 SkillAdapterId 取回实现。 */

import type { SkillAdapterId } from '../../types/skill';
import { ideogram4Adapter } from './ideogram4';
import { noneAdapter } from './none';
import type { SkillAdapter } from './types';

const ADAPTERS: Partial<Record<SkillAdapterId, SkillAdapter>> = {
  ideogram4: ideogram4Adapter,
  none: noneAdapter,
};

export function getAdapter(id: SkillAdapterId): SkillAdapter {
  return ADAPTERS[id] ?? noneAdapter;
}

export function listAdapters(): SkillAdapter[] {
  return [ideogram4Adapter, noneAdapter];
}

export { ideogram4Adapter, noneAdapter };
export type { SkillAdapter, SkillExtraction, SkillExtractionError, SkillPromptOptions } from './types';
