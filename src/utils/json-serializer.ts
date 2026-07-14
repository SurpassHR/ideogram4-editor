import type { IdeogramOutput } from '../types';
import type { Box } from '../types';
import { norm, denorm } from './coordinates';

export function generateJSON(
  boxes: Box[],
  canvasW: number,
  canvasH: number,
  globalPalette: string[],
  highLevelDescription: string,
  aesthetics: string,
  lighting: string,
  medium: string,
  artStyle: string,
  background: string,
  photoArtStyleMode: 0 | 1,
  includeImageData = false,
): IdeogramOutput {
  const elements = boxes.map(box => {
    const x1 = norm(box.x, canvasW);
    const y1 = norm(box.y, canvasH);
    const x2 = norm(box.x + box.w, canvasW);
    const y2 = norm(box.y + box.h, canvasH);

    const el: Record<string, unknown> = {
      type: box.mode,
      bbox: [y1, x1, y2, x2],
    };

    if (box.mode === 'text') el.text = box.text;
    el.desc = box.desc;
    if (box.colors && box.colors.length > 0) el.color_palette = box.colors;
    if (includeImageData && box.imageDataUrl) el.image_data = box.imageDataUrl;

    return el;
  });

  const styleDescription: Record<string, unknown> = {
    aesthetics,
    lighting,
    color_palette: globalPalette,
  };

  if (photoArtStyleMode === 0) {
    styleDescription.photo = artStyle;
    styleDescription.medium = medium;
  } else {
    styleDescription.medium = medium;
    styleDescription.art_style = artStyle;
  }

  return {
    high_level_description: highLevelDescription,
    style_description: styleDescription as IdeogramOutput['style_description'],
    compositional_deconstruction: {
      background,
      elements: elements as unknown as IdeogramOutput['compositional_deconstruction']['elements'],
    },
  };
}

/**
 * 将结构化的 IdeogramOutput JSON 转换成人类可读的自然语言提示词。
 * 保留布局位置、尺寸、颜色、描述等所有信息，不丢失细节。
 * @param output - 结构化 JSON 输出
 * @param t - i18n 翻译函数（带插值），用于按当前语言输出自然语言文本
 */
export function jsonToNaturalLanguage(
  output: IdeogramOutput,
  t: (path: string, vars?: Record<string, string | number>) => string,
): string {
  const lines: string[] = [];

  // 1. 高层描述
  if (output.high_level_description) {
    lines.push(`【${t('json.nlScene')}】`);
    lines.push(output.high_level_description);
    lines.push('');
  }

  // 2. 风格描述
  const sd = output.style_description;
  const styleParts: string[] = [];
  if (sd.aesthetics) styleParts.push(`${t('panels.globalSettings.aesthetics')}：${sd.aesthetics}`);
  if (sd.lighting) styleParts.push(`${t('panels.globalSettings.lighting')}：${sd.lighting}`);
  if (sd.medium) styleParts.push(`${t('panels.globalSettings.medium')}：${sd.medium}`);
  if (sd.photo) styleParts.push(`${t('panels.globalSettings.photo')}：${sd.photo}`);
  if (sd.art_style) styleParts.push(`${t('panels.globalSettings.artStyle')}：${sd.art_style}`);

  if (styleParts.length > 0) {
    lines.push(`【${t('json.nlStyle')}】`);
    styleParts.forEach(p => lines.push(`  · ${p}`));
  }

  // 3. 全局调色板
  if (sd.color_palette && sd.color_palette.length > 0) {
    lines.push(`  · ${t('json.nlColorPalette', { colors: sd.color_palette.join(', ') })}`);
  }

  if (styleParts.length > 0 || (sd.color_palette && sd.color_palette.length > 0)) {
    lines.push('');
  }

  // 4. 背景
  if (output.compositional_deconstruction.background) {
    lines.push(`【${t('json.nlBackground')}】`);
    lines.push(output.compositional_deconstruction.background);
    lines.push('');
  }

  // 5. 布局元素
  const elements = output.compositional_deconstruction.elements;
  if (elements.length > 0) {
    lines.push(`【${t('json.nlElements')}】`);
    lines.push('');

    elements.forEach((el, i) => {
      const [y1, x1, y2, x2] = el.bbox;
      const typeLabel = el.type === 'text'
        ? t('json.nlText')
        : t('json.nlObject');

      lines.push(`  ${i + 1}. ${t('json.nlElement')}（${typeLabel}）：`);

      if (el.text) {
        lines.push(`    · ${t('json.nlTextContent')}："${el.text}"`);
      }
      if (el.desc) {
        lines.push(`    · ${t('panels.boxProperties.description')}：${el.desc}`);
      }

      // 位置描述（百分比）
      const leftPct = Math.round((x1 / 1000) * 100);
      const topPct = Math.round((y1 / 1000) * 100);
      const rightPct = Math.round((x2 / 1000) * 100);
      const bottomPct = Math.round((y2 / 1000) * 100);
      const widthPct = Math.round(((x2 - x1) / 1000) * 100);
      const heightPct = Math.round(((y2 - y1) / 1000) * 100);

      lines.push(`    · ${t('json.nlPosition', {
        left: leftPct, right: rightPct,
        top: topPct, bottom: bottomPct,
      })}`);
      lines.push(`    · ${t('json.nlSize', { width: widthPct, height: heightPct })}`);

      if (el.color_palette && el.color_palette.length > 0) {
        lines.push(`    · ${t('json.nlColors', { colors: el.color_palette.join(', ') })}`);
      }

      lines.push('');
    });
  }

  return lines.join('\n');
}

export function parseBoxesFromJSON(
  json: IdeogramOutput,
  canvasW: number,
  canvasH: number,
): Omit<Box, 'id'>[] {
  return json.compositional_deconstruction.elements.map(el => {
    const [y1, x1, y2, x2] = el.bbox;
    const imageDataUrl = (el as unknown as Record<string, unknown>).image_data as string | undefined;
    return {
      x: denorm(x1, canvasW),
      y: denorm(y1, canvasH),
      w: denorm(x2 - x1, canvasW),
      h: denorm(y2 - y1, canvasH),
      mode: el.type === 'text' ? 'text' : 'obj',
      text: el.text || '',
      desc: el.desc || '',
      colors: el.color_palette || [],
      imageDataUrl: imageDataUrl || null,
      imageRole: 'both' as const,
    };
  });
}
