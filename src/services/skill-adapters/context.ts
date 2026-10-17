/** 画布上下文构建助手 — 把 store 快照转成各 adapter 需要的元素表。 */

import { norm } from '../../utils/coordinates';
import type { CanvasChatStoreSnapshot } from '../llm-canvas-chat';

export interface ContextElement {
  id: string;
  type: 'obj' | 'text';
  bbox: [number, number, number, number];
  desc: string;
  text?: string;
  color_palette?: string[];
}

/** 画布元素转成 0-1000 yxyx 的中间表示 */
export function canvasElementsTo1000(snapshot: CanvasChatStoreSnapshot): ContextElement[] {
  return snapshot.boxes.map((box, index) => {
    const element: ContextElement = {
      id: `${box.mode === 'text' ? 'text' : 'obj'}_${index + 1}`,
      type: box.mode,
      bbox: [
        norm(box.y, snapshot.canvasH),
        norm(box.x, snapshot.canvasW),
        norm(box.y + box.h, snapshot.canvasH),
        norm(box.x + box.w, snapshot.canvasW),
      ],
      desc: box.desc,
    };
    if (box.mode === 'text' && box.text) element.text = box.text;
    if (box.colors.length > 0) element.color_palette = box.colors;
    return element;
  });
}

/** 全局风格摘要（仅保留有值的字段） */
export function canvasGlobalSummary(snapshot: CanvasChatStoreSnapshot): Record<string, string> {
  const summary: Record<string, string> = {};
  if (snapshot.highLevelDescription) summary.high_level_description = snapshot.highLevelDescription;
  if (snapshot.background) summary.background = snapshot.background;
  if (snapshot.aesthetics) summary.aesthetics = snapshot.aesthetics;
  if (snapshot.lighting) summary.lighting = snapshot.lighting;
  if (snapshot.medium) summary.medium = snapshot.medium;
  if (snapshot.artStyle) summary.art_style = snapshot.artStyle;
  if (snapshot.globalPalette.length > 0) summary.color_palette = snapshot.globalPalette.join(', ');
  return summary;
}
