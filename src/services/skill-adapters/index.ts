/** adapter 注册表 — 按 SkillAdapterId 取回实现。 */

import type { SkillAdapterId } from '../../types/skill';
import { flux3LayoutAdapter } from './flux3-layout';
import { ideogram4Adapter } from './ideogram4';
import { noneAdapter } from './none';
import type { SkillAdapter } from './types';

const ADAPTERS: Partial<Record<SkillAdapterId, SkillAdapter>> = {
  ideogram4: ideogram4Adapter,
  'flux3-layout': flux3LayoutAdapter,
  none: noneAdapter,
};

export function getAdapter(id: SkillAdapterId): SkillAdapter {
  return ADAPTERS[id] ?? noneAdapter;
}

export function listAdapters(): SkillAdapter[] {
  return [ideogram4Adapter, flux3LayoutAdapter, noneAdapter];
}

export { flux3LayoutAdapter, ideogram4Adapter, noneAdapter };
export type { SkillAdapter, SkillExtraction, SkillExtractionError, SkillPromptOptions } from './types';
