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

export function parseBoxesFromJSON(
  json: IdeogramOutput,
  canvasW: number,
  canvasH: number,
): Omit<Box, 'id'>[] {
  return json.compositional_deconstruction.elements.map(el => {
    const [y1, x1, y2, x2] = el.bbox;
    return {
      x: denorm(x1, canvasW),
      y: denorm(y1, canvasH),
      w: denorm(x2 - x1, canvasW),
      h: denorm(y2 - y1, canvasH),
      mode: el.type,
      text: el.text || '',
      desc: el.desc || '',
      colors: el.color_palette || [],
    };
  });
}