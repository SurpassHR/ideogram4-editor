import { describe, expect, it } from 'vitest';
import { compileMossPrompt } from '../../services/moss-compile';
import {
  generateJsonScheme,
  parseJsonSchemeForPreview,
  type Flux3LayoutRow,
  type JsonSchemeSnapshot,
  type MossLayoutDraft,
} from '../json-schemes';

function makeSnapshot(): JsonSchemeSnapshot {
  return {
    canvasW: 1024,
    canvasH: 1024,
    boxes: [
      {
        id: 'box_0',
        x: 0,
        y: 0,
        w: 1024,
        h: 512,
        mode: 'obj',
        text: '',
        desc: 'Wide background object',
        colors: ['#FF0000'],
        imageDataUrl: null,
        imageRole: 'both',
      },
      {
        id: 'box_1',
        x: 512,
        y: 512,
        w: 512,
        h: 256,
        mode: 'text',
        text: 'HELLO',
        desc: 'Headline',
        colors: [],
        imageDataUrl: null,
        imageRole: 'both',
      },
    ],
    globalPalette: ['#FF0000'],
    highLevelDescription: 'Poster scene',
    aesthetics: 'Bold',
    lighting: 'Soft',
    medium: 'digital illustration',
    artStyle: 'flat vector',
    background: 'Studio backdrop',
    photoArtStyleMode: 1,
  };
}

describe('generateJsonScheme', () => {
  it('Ideogram 4 保持原有结构化 caption 与 yxyx bbox', () => {
    const output = generateJsonScheme('ideogram4', makeSnapshot()) as unknown as Record<string, unknown>;
    const elements = (output.compositional_deconstruction as { elements: Array<Record<string, unknown>> }).elements;

    expect(elements[0].bbox).toEqual([0, 0, 500, 1000]);
    expect(elements[1]).toMatchObject({ type: 'text', text: 'HELLO', bbox: [500, 500, 750, 1000] });
    expect((output.style_description as Record<string, unknown>).art_style).toBe('flat vector');
  });

  it('FLUX 3 输出布局行数组，并按 top/left/bottom/right 排列 bbox', () => {
    const rows = generateJsonScheme('flux3-layout', {
      ...makeSnapshot(),
      flux3Globals: { fullScenePrompt: 'A complete FLUX 3 scene.', palette: ['#00FF00'] },
    }) as Flux3LayoutRow[];

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'obj_1',
      bbox: [0, 0, 500, 1000],
      desc: 'Wide background object',
    });
    expect(rows[1]).toMatchObject({
      id: 'text_2',
      type: 'text',
      text: 'HELLO',
      bbox: [500, 500, 750, 1000],
    });
    // Full Scene Prompt 不进入布局数组，保持 FLUX 3 官方输出契约。
    expect(Array.isArray(rows)).toBe(true);
  });

  it('MOSS-Image 使用独立 profile 的 summary 字段', () => {
    const draft = generateJsonScheme('moss-layout', {
      ...makeSnapshot(),
      mossGlobals: {
        summaryCaption: 'MOSS scene',
        meta: ['poster', 'soft light'],
        canvas: 'collage',
        palette: ['#00FF00', '#0000FF'],
      },
    }) as MossLayoutDraft;

    expect(draft.summary).toEqual({
      caption: 'MOSS scene',
      meta: ['poster', 'soft light'],
      canvas: 'collage',
      palette: ['#00FF00', '#0000FF'],
    });
    expect(() => compileMossPrompt(draft)).not.toThrow();
  });

  it('空画布的 MOSS-Image 使用 profile caption', () => {
    const snapshot = {
      ...makeSnapshot(),
      boxes: [],
      mossGlobals: {
        summaryCaption: 'Only caption',
        meta: [],
        canvas: 'single' as const,
        palette: [],
      },
    };
    expect(generateJsonScheme('moss-layout', snapshot)).toEqual({ caption: 'Only caption' });
  });

  it('MOSS-Image 输出绝对像素 xyxy 草稿且可被官方 compiler 接受', () => {
    const draft = generateJsonScheme('moss-layout', makeSnapshot()) as MossLayoutDraft;

    expect(draft.width).toBe(1024);
    expect(draft.height).toBe(1024);
    expect(draft.bbox_coord_space).toBe('abs');
    expect(draft.bbox_format).toBe('xyxy');
    expect(draft.summary.caption).toContain('Poster scene');
    expect(draft.summary.palette).toEqual(['#FF0000']);
    expect(draft.items[0]).toMatchObject({ label: 'object', bbox: [0, 0, 1024, 512] });
    expect(draft.items[1]).toMatchObject({ label: 'text', text: 'HELLO', bbox: [512, 512, 1024, 768] });
    expect(() => compileMossPrompt(draft)).not.toThrow();
  });

  it('空画布的 MOSS-Image 输出合法 caption 草稿', () => {
    const snapshot = { ...makeSnapshot(), boxes: [] };
    expect(generateJsonScheme('moss-layout', snapshot)).toEqual({ caption: 'Poster scene Studio backdrop' });
  });
});

describe('parseJsonSchemeForPreview', () => {
  it('统一把三种 bbox 结构转换成 0-1000 yxyx 供预览使用', () => {
    const snapshot = makeSnapshot();
    const ideogram = parseJsonSchemeForPreview(
      JSON.stringify(generateJsonScheme('ideogram4', snapshot)),
      'ideogram4',
      1024,
      1024,
    );
    const flux3 = parseJsonSchemeForPreview(
      JSON.stringify(generateJsonScheme('flux3-layout', snapshot)),
      'flux3-layout',
      1024,
      1024,
    );
    const moss = parseJsonSchemeForPreview(
      JSON.stringify(generateJsonScheme('moss-layout', snapshot)),
      'moss-layout',
      1024,
      1024,
    );

    expect(ideogram.elements.map(element => element.bbox)).toEqual([
      [0, 0, 500, 1000],
      [500, 500, 750, 1000],
    ]);
    expect(flux3.elements.map(element => element.bbox)).toEqual([
      [0, 0, 500, 1000],
      [500, 500, 750, 1000],
    ]);
    expect(moss.elements.map(element => element.bbox)).toEqual([
      [0, 0, 500, 1000],
      [500, 500, 750, 1000],
    ]);
    expect(moss.summary).toBe('Poster scene Studio backdrop');
  });

  it('MOSS caption 草稿可作为无 bbox 预览', () => {
    const preview = parseJsonSchemeForPreview(
      JSON.stringify({ caption: 'A calm photograph.' }),
      'moss-layout',
      1024,
      1024,
    );
    expect(preview.elements).toEqual([]);
    expect(preview.summary).toBe('A calm photograph.');
  });
});
