/** 纯文本降级 adapter — 不解析 bbox，只展示与复制。 */

import type { CanvasChatStoreSnapshot } from '../llm-canvas-chat';
import type { SkillAdapter, SkillExtraction } from './types';

export const noneAdapter: SkillAdapter = {
  id: 'none',
  label: 'Plain text',

  buildSystemPrompt(skill, opts) {
    return [
      'You are an assistant helping the user craft image-generation prompts.',
      `## Active skill: ${skill.displayName} (${skill.name})`,
      skill.files.find(f => f.path === 'SKILL.md')?.content ?? '',
      opts.responseLang === 'zh'
        ? '你必须用中文回复。'
        : 'Respond in the same language the user uses.',
    ].join('\n\n');
  },

  buildCanvasContext(snapshot: CanvasChatStoreSnapshot) {
    const boxes = snapshot.boxes.map((box, index) =>
      `${index + 1}. ${box.mode === 'text' ? `text="${box.text}"` : 'object'} @ (${Math.round(box.x)},${Math.round(box.y)}) ${Math.round(box.w)}x${Math.round(box.h)} — ${box.desc}`,
    );
    return [
      `Canvas: ${snapshot.canvasW}x${snapshot.canvasH}`,
      `Global description: ${snapshot.highLevelDescription || '(empty)'}`,
      `Background: ${snapshot.background || '(empty)'}`,
      `Elements (${boxes.length}):`,
      ...boxes,
    ].join('\n');
  },

  extract(text: string) {
    return { error: '该 skill 未声明可解析的输出格式（adapter），仅支持展示与复制。', raw: text };
  },

  toCopyText(extraction: SkillExtraction) {
    return extraction.raw;
  },
};
