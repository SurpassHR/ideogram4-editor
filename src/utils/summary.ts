/**
 * 画布级 AI 构图结果的自然语言摘要。
 *
 * 零代码用户不应该看到 JSON —— 消息气泡只展示一行人话摘要，
 * 具体构图细节由画布本身承载。
 */

import type { SkillExtraction } from '../services/skill-adapters/types';

/** 摘要的最大长度（超出截断，避免气泡被长句撑爆） */
const SUMMARY_MAX_LENGTH = 220;

/** 把任意文本压成一行、限长、去掉多余空白 */
export function normalizeSummaryText(text: string, maxLength = SUMMARY_MAX_LENGTH): string {
  const flattened = text.replace(/\s+/g, ' ').trim();
  if (flattened.length <= maxLength) return flattened;
  return `${flattened.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

/**
 * 从 skill 解析结果生成一行自然语言摘要。
 *
 * 降级顺序：
 * 1. adapter 自己产出的 summary（flux3-layout / moss-layout 等）
 * 2. globals.high_level_description（Ideogram 4 的场景概述）
 * 3. 第一个 element 的 desc
 * 4. 空串（由调用方回退到「已生成 N 个元素」）
 */
export function buildExtractionSummary(extraction: SkillExtraction): string {
  const explicit = extraction.summary?.trim();
  if (explicit) return normalizeSummaryText(explicit);

  const scene = extraction.globals?.high_level_description?.trim();
  if (scene) return normalizeSummaryText(scene);

  const firstDesc = extraction.elements.find(el => el.desc?.trim())?.desc?.trim();
  if (firstDesc) return normalizeSummaryText(firstDesc);

  return '';
}

/**
 * 生成摘要的最终形态：没有可用文本时回退到「已生成 N 个元素」。
 *
 * @param extraction skill 解析结果
 * @param fallbackCountText 无摘要时的兜底文案（由调用方通过 i18n 提供）
 */
export function resolveSummaryText(extraction: SkillExtraction, fallbackCountText: string): string {
  return buildExtractionSummary(extraction) || fallbackCountText;
}

