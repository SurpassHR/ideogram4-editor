/** Skill 输出适配器契约 — 统一把各模型的输出解析成 0-1000 的 yxyx elements。 */

import type { IdeogramElement, IdeogramOutput } from '../../types';
import type { SkillAdapterId, SkillFile, SkillRecord } from '../../types/skill';
import type { CanvasChatStoreSnapshot } from '../llm-canvas-chat';

/** skill 输出中的全局风格字段（与 Ideogram 结构对齐，其它模型可选） */
export interface SkillStyleDescription {
  aesthetics?: string;
  lighting?: string;
  medium?: string;
  art_style?: string;
  photo?: string;
  color_palette?: string[];
}

export interface SkillGlobals {
  high_level_description?: string;
  style_description?: SkillStyleDescription;
  background?: string;
}

/** 提取时需要的画布信息（像素 bbox 归一化用） */
export interface SkillExtractContext {
  canvasW: number;
  canvasH: number;
}

/** 解析成功的结果：elements 的 bbox 一律是 [y,x,y,x] 0-1000 */
export interface SkillExtraction {
  adapter: SkillAdapterId;
  elements: IdeogramElement[];
  globals?: SkillGlobals;
  canvas?: { width: number; height: number };
  /** skill 的原始输出文本，用于"复制模型 prompt" */
  raw: string;
  warnings: string[];
  /** 仅 ideogram4：完整结构化输出，沿用现有会话持久化与 JSON 预览 */
  ideogramOutput?: IdeogramOutput;
  /** adapter 解析出的结构化原始产物（例如 MOSS Layout 草稿），供"复制模型 prompt"复用 */
  payload?: unknown;
}

export interface SkillExtractionError {
  error: string;
  raw: string;
}

export function isSkillExtractionError(
  value: SkillExtraction | SkillExtractionError,
): value is SkillExtractionError {
  return 'error' in value;
}

export interface SkillPromptOptions {
  responseLang?: string;
  /** 用户勾选要注入的 reference 路径；缺省表示全部注入 */
  enabledReferencePaths?: string[];
}

export interface SkillAdapter {
  id: SkillAdapterId;
  label: string;
  /** 组装 system prompt：adapter 基础 prompt + skill 文本 + 语言提示 */
  buildSystemPrompt(skill: SkillRecord, opts: SkillPromptOptions): string;
  /** 生成发给 LLM 的画布上下文 */
  buildCanvasContext(snapshot: CanvasChatStoreSnapshot, targetSize: number): string;
  extract(text: string, ctx: SkillExtractContext): SkillExtraction | SkillExtractionError;
  toCopyText(extraction: SkillExtraction): string;
}

export interface SkillPromptPlan {
  skill: SkillRecord;
  injected: SkillFile[];
  skipped: string[];
  totalChars: number;
}
