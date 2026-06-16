import type { Box } from '../types';

/**
 * 替换模板字符串中的变量占位符。
 * 支持占位符：{box_text}, {box_desc}, {box_colors}, {box_mode}
 * 未知占位符保持原样。
 */
export function resolveTemplate(template: string, box: Box): string {
  return template
    .replace(/\{box_text\}/g, box.text || '')
    .replace(/\{box_desc\}/g, box.desc || '')
    .replace(/\{box_colors\}/g, box.colors.join(', '))
    .replace(/\{box_mode\}/g, box.mode);
}