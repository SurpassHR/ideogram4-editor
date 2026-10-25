/**
 * JSON prompt schemes — 把画布状态序列化成不同模型要求的 JSON 结构。
 *
 * - ideogram4: 完整结构化 caption，bbox 为 0-1000 的 [y, x, y, x]
 * - flux3-layout: Flux3LayoutPrompt 的布局行数组，bbox 为 0-1000 的 [top, left, bottom, right]
 * - moss-layout: MOSS-Image 的像素 Layout 草稿，bbox 为绝对像素 xyxy
 */

import type { Box, IdeogramElement, IdeogramOutput, PhotoArtStyleMode } from '../types';
import { generateJSON } from './json-serializer';
import { norm } from './coordinates';

export type JsonScheme = 'ideogram4' | 'flux3-layout' | 'moss-layout';

export interface JsonSchemeDescriptor {
  id: JsonScheme;
  label: string;
  /** i18n schemeHints 的 key */
  hintKey: 'ideogram4' | 'flux3' | 'moss';
}

export const JSON_SCHEMES: readonly JsonSchemeDescriptor[] = [
  { id: 'ideogram4', label: 'Ideogram 4', hintKey: 'ideogram4' },
  { id: 'flux3-layout', label: 'FLUX 3', hintKey: 'flux3' },
  { id: 'moss-layout', label: 'MOSS-Image', hintKey: 'moss' },
];

export const DEFAULT_JSON_SCHEME: JsonScheme = 'ideogram4';
export const JSON_SCHEME_STORAGE_KEY = 'ideogram4-json-scheme';

export function isJsonScheme(value: unknown): value is JsonScheme {
  return value === 'ideogram4' || value === 'flux3-layout' || value === 'moss-layout';
}

export function readStoredJsonScheme(): JsonScheme {
  try {
    const stored = localStorage.getItem(JSON_SCHEME_STORAGE_KEY);
    return isJsonScheme(stored) ? stored : DEFAULT_JSON_SCHEME;
  } catch {
    return DEFAULT_JSON_SCHEME;
  }
}

export function writeStoredJsonScheme(scheme: JsonScheme): void {
  try {
    localStorage.setItem(JSON_SCHEME_STORAGE_KEY, scheme);
  } catch {
    // localStorage 不可用时只影响持久化，不影响当前会话。
  }
}

export interface JsonSchemeSnapshot {
  boxes: Box[];
  canvasW: number;
  canvasH: number;
  globalPalette: string[];
  highLevelDescription: string;
  aesthetics: string;
  lighting: string;
  medium: string;
  artStyle: string;
  background: string;
  photoArtStyleMode: PhotoArtStyleMode;
}

/** Flux3LayoutPrompt 的单个布局行 */
export interface Flux3LayoutRow {
  id: string;
  bbox: [number, number, number, number];
  desc: string;
  type?: 'text';
  text?: string;
}

export interface MossLayoutItem {
  label: 'object' | 'character' | 'text';
  caption: string;
  bbox: [number, number, number, number];
  text?: string;
  palette?: string[];
}

export interface MossLayoutDraft {
  width: number;
  height: number;
  bbox_coord_space: 'abs';
  bbox_format: 'xyxy';
  summary: {
    caption: string;
    meta?: string[];
    canvas?: 'single' | 'multi_panel' | 'collage';
    palette?: string[];
  };
  items: MossLayoutItem[];
}

export interface MossCaptionDraft {
  caption: string;
}

function generateIdeogramOutput(snapshot: JsonSchemeSnapshot): IdeogramOutput {
  return generateJSON(
    snapshot.boxes,
    snapshot.canvasW,
    snapshot.canvasH,
    snapshot.globalPalette,
    snapshot.highLevelDescription,
    snapshot.aesthetics,
    snapshot.lighting,
    snapshot.medium,
    snapshot.artStyle,
    snapshot.background,
    snapshot.photoArtStyleMode,
  );
}

function boxBboxYxyx(box: Box, canvasW: number, canvasH: number): [number, number, number, number] {
  return [
    norm(box.y, canvasH),
    norm(box.x, canvasW),
    norm(box.y + box.h, canvasH),
    norm(box.x + box.w, canvasW),
  ];
}

function generateFlux3Rows(snapshot: JsonSchemeSnapshot): Flux3LayoutRow[] {
  return snapshot.boxes.map((box, index) => {
    const [top, left, bottom, right] = boxBboxYxyx(box, snapshot.canvasW, snapshot.canvasH);
    const fallbackDesc = box.mode === 'text' ? 'Text element' : 'Object element';
    const row: Flux3LayoutRow = {
      id: `${box.mode === 'text' ? 'text' : 'obj'}_${index + 1}`,
      bbox: [top, left, bottom, right],
      desc: box.desc.trim() || fallbackDesc,
    };
    if (box.mode === 'text') {
      row.type = 'text';
      row.text = box.text;
    }
    return row;
  });
}

function clampPixel(value: number, max: number): number {
  return Math.min(max, Math.max(0, Math.round(value)));
}

function boxBboxPixels(box: Box, canvasW: number, canvasH: number): [number, number, number, number] {
  const x1 = Math.min(Math.max(0, canvasW - 1), clampPixel(box.x, canvasW));
  const y1 = Math.min(Math.max(0, canvasH - 1), clampPixel(box.y, canvasH));
  const x2 = Math.min(canvasW, Math.max(x1 + 1, clampPixel(box.x + box.w, canvasW)));
  const y2 = Math.min(canvasH, Math.max(y1 + 1, clampPixel(box.y + box.h, canvasH)));
  return [x1, y1, x2, y2];
}

function mossSummaryCaption(snapshot: JsonSchemeSnapshot, itemCount: number): string {
  const parts = [snapshot.highLevelDescription.trim(), snapshot.background.trim()].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return itemCount > 0
    ? `An image composed of ${itemCount} described element${itemCount === 1 ? '' : 's'}.`
    : 'A single composed image.';
}

function generateMossDraft(snapshot: JsonSchemeSnapshot): MossLayoutDraft | MossCaptionDraft {
  const items: MossLayoutItem[] = snapshot.boxes.map((box, index) => {
    const isText = box.mode === 'text';
    const caption = box.desc.trim()
      || (isText ? (box.text.trim() ? `Text reading "${box.text.trim()}"` : 'Text element') : `Object ${index + 1}`);
    const item: MossLayoutItem = {
      label: isText ? 'text' : 'object',
      caption,
      bbox: boxBboxPixels(box, snapshot.canvasW, snapshot.canvasH),
    };
    if (isText) item.text = box.text.trim() || 'Text';
    if (box.colors.length > 0) item.palette = [...box.colors];
    return item;
  });

  const summaryCaption = mossSummaryCaption(snapshot, items.length);
  if (items.length === 0) return { caption: summaryCaption };

  const meta = [
    snapshot.aesthetics,
    snapshot.lighting,
    snapshot.medium,
    snapshot.artStyle,
  ].map(value => value.trim()).filter(Boolean);

  return {
    width: snapshot.canvasW,
    height: snapshot.canvasH,
    bbox_coord_space: 'abs',
    bbox_format: 'xyxy',
    summary: {
      caption: summaryCaption,
      canvas: 'single',
      ...(meta.length > 0 ? { meta } : {}),
      ...(snapshot.globalPalette.length > 0 ? { palette: [...snapshot.globalPalette] } : {}),
    },
    items,
  };
}

/** 按 scheme 生成可直接编辑/粘贴的 JSON prompt 对象 */
export function generateJsonScheme(
  scheme: JsonScheme,
  snapshot: JsonSchemeSnapshot,
): IdeogramOutput | Flux3LayoutRow[] | MossLayoutDraft | MossCaptionDraft {
  switch (scheme) {
    case 'flux3-layout':
      return generateFlux3Rows(snapshot);
    case 'moss-layout':
      return generateMossDraft(snapshot);
    case 'ideogram4':
    default:
      return generateIdeogramOutput(snapshot);
  }
}

export interface JsonSchemePreview {
  elements: IdeogramElement[];
  summary: string;
  canvasW: number;
  canvasH: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBbox(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value)
    && value.length === 4
    && value.every(entry => typeof entry === 'number' && Number.isFinite(entry));
}

function toIdeogramElement(value: unknown, index: number): IdeogramElement {
  if (!isRecord(value)) throw new Error(`elements[${index}] must be an object`);
  if (!isBbox(value.bbox)) throw new Error(`elements[${index}].bbox must contain 4 numbers`);
  const type = typeof value.type === 'string' && value.type.trim() ? value.type : 'obj';
  const element: IdeogramElement = {
    type,
    bbox: [...value.bbox],
    desc: typeof value.desc === 'string' ? value.desc : '',
  };
  if (typeof value.text === 'string') element.text = value.text;
  if (Array.isArray(value.color_palette)) {
    element.color_palette = value.color_palette.filter((entry): entry is string => typeof entry === 'string');
  }
  return element;
}

function parseIdeogramPreview(parsed: unknown, fallbackW: number, fallbackH: number): JsonSchemePreview {
  if (!isRecord(parsed)) throw new Error('JSON root must be an object');
  const cd = parsed.compositional_deconstruction;
  if (!isRecord(cd) || !Array.isArray(cd.elements)) {
    throw new Error('compositional_deconstruction.elements must be an array');
  }
  return {
    elements: cd.elements.map(toIdeogramElement),
    summary: typeof parsed.high_level_description === 'string' ? parsed.high_level_description : '',
    canvasW: typeof parsed.canvasW === 'number' ? parsed.canvasW : fallbackW,
    canvasH: typeof parsed.canvasH === 'number' ? parsed.canvasH : fallbackH,
  };
}

function parseFlux3Preview(parsed: unknown, fallbackW: number, fallbackH: number): JsonSchemePreview {
  if (!Array.isArray(parsed)) throw new Error('FLUX 3 layout JSON must be an array');
  const elements: IdeogramElement[] = [];
  parsed.forEach((row, index) => {
    if (!isRecord(row)) return;
    const bbox = isBbox(row.bbox) ? row.bbox : (isBbox(row.tgt_bbox) ? row.tgt_bbox : null);
    if (!bbox) return;
    const isText = row.type === 'text' || row.label === 'text';
    const element: IdeogramElement = {
      type: isText ? 'text' : 'obj',
      bbox: [...bbox],
      desc: typeof row.desc === 'string' ? row.desc : `Element ${index + 1}`,
    };
    if (isText && typeof row.text === 'string') element.text = row.text;
    elements.push(element);
  });
  return { elements, summary: '', canvasW: fallbackW, canvasH: fallbackH };
}

function parseMossPreview(parsed: unknown, fallbackW: number, fallbackH: number): JsonSchemePreview {
  if (!isRecord(parsed)) throw new Error('MOSS-Image JSON must be an object');

  if (typeof parsed.caption === 'string' && !Array.isArray(parsed.items)) {
    return { elements: [], summary: parsed.caption, canvasW: fallbackW, canvasH: fallbackH };
  }

  const width = typeof parsed.width === 'number' && parsed.width > 0 ? parsed.width : fallbackW;
  const height = typeof parsed.height === 'number' && parsed.height > 0 ? parsed.height : fallbackH;
  const summary = isRecord(parsed.summary) && typeof parsed.summary.caption === 'string'
    ? parsed.summary.caption
    : '';
  const elements: IdeogramElement[] = [];

  if (Array.isArray(parsed.items)) {
    parsed.items.forEach((item, index) => {
      if (!isRecord(item) || !isBbox(item.bbox)) return;
      const [x1, y1, x2, y2] = item.bbox;
      const isText = item.label === 'text';
      const element: IdeogramElement = {
        type: isText ? 'text' : 'obj',
        bbox: [norm(y1, height), norm(x1, width), norm(y2, height), norm(x2, width)],
        desc: typeof item.caption === 'string' ? item.caption : `Element ${index + 1}`,
      };
      if (isText && typeof item.text === 'string') element.text = item.text;
      if (Array.isArray(item.palette)) {
        element.color_palette = item.palette.filter((entry): entry is string => typeof entry === 'string');
      }
      elements.push(element);
    });
  }

  return { elements, summary, canvasW: width, canvasH: height };
}

/** 解析当前文本框内容，供 Preview 使用 */
export function parseJsonSchemeForPreview(
  text: string,
  scheme: JsonScheme,
  fallbackW: number,
  fallbackH: number,
): JsonSchemePreview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }

  switch (scheme) {
    case 'flux3-layout':
      return parseFlux3Preview(parsed, fallbackW, fallbackH);
    case 'moss-layout':
      return parseMossPreview(parsed, fallbackW, fallbackH);
    case 'ideogram4':
    default:
      return parseIdeogramPreview(parsed, fallbackW, fallbackH);
  }
}

