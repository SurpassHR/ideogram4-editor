/**
 * MOSS-Image prompt 编译器 — 官方 `scripts/compile_prompt.py` 的 TS 重实现。
 *
 * 语义（与官方脚本一致）：
 * - caption 草稿 `{"caption": "..."}` → 原样返回 caption 文本
 * - Layout 草稿（绝对像素 xyxy）→ 先 floor 左/上、ceil 右/下，再减半宽半高，
 *   输出单行 JSON `{summary, items, bbox_coord_space:"abs_centralized", bbox_format:"yxyx"}`
 */

type Json = Record<string, unknown>;

const ROOT_FIELDS = ['width', 'height', 'bbox_coord_space', 'bbox_format', 'summary', 'items'];
const SUMMARY_FIELDS = ['caption', 'meta', 'canvas', 'palette'];
const ITEM_FIELDS = ['label', 'caption', 'bbox', 'text', 'tags', 'palette'];
const ITEM_LABELS = ['object', 'character', 'text'];
const CANVAS_KINDS = ['single', 'multi_panel', 'collage'];

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function checkFields(value: Json, allowed: string[], required: string[], location: string): void {
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  require(unknown.length === 0, `${location}: unknown fields ${JSON.stringify(unknown)}`);
  const missing = required.filter(key => !(key in value));
  require(missing.length === 0, `${location}: missing fields ${JSON.stringify(missing)}`);
}

function requireText(value: unknown, location: string): asserts value is string {
  require(typeof value === 'string' && value.trim().length > 0, `${location} must be nonempty text`);
}

function requireStringArray(value: unknown, location: string): void {
  require(Array.isArray(value), `${location} must be an array`);
  value.forEach((entry, index) => requireText(entry, `${location}[${index}]`));
}

function requireDimension(value: unknown, name: string): number {
  require(
    typeof value === 'number' && Number.isInteger(value) && value > 0 && value % 16 === 0,
    `${name} must be a positive integer multiple of 16`,
  );
  return value;
}

function round9(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

/** 绝对像素 xyxy → 中心原点 yxyx（与官方 centered_box 一致） */
export function centeredBox(
  box: unknown,
  width: number,
  height: number,
  location: string,
): [number, number, number, number] {
  require(Array.isArray(box) && box.length === 4, `${location} must be [x1,y1,x2,y2]`);
  const values = box as unknown[];
  require(
    values.every(v => typeof v === 'number' && Number.isFinite(v)),
    `${location} must contain four finite numbers`,
  );
  const [x1, y1, x2, y2] = values as [number, number, number, number];
  require(x1 < x2 && y1 < y2, `${location} must have positive width and height`);
  require(
    0 <= x1 && x2 <= width && 0 <= y1 && y2 <= height,
    `${location} exceeds the ${width}x${height} canvas`,
  );
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);
  const result: [number, number, number, number] = [
    Math.floor(round9(y1)) - halfH,
    Math.floor(round9(x1)) - halfW,
    Math.ceil(round9(y2)) - halfH,
    Math.ceil(round9(x2)) - halfW,
  ];
  require(result[0] < result[2] && result[1] < result[3], `${location} is too small at export precision`);
  return result;
}

/** 编译 MOSS-Image 草稿为可直接粘贴的模型 prompt */
export function compileMossPrompt(draft: unknown): string {
  require(isRecord(draft), 'Draft must be a JSON object');

  if ('caption' in draft) {
    checkFields(draft, ['caption'], ['caption'], 'Caption draft');
    requireText(draft.caption, 'caption');
    return draft.caption;
  }

  checkFields(draft, ROOT_FIELDS, ROOT_FIELDS, 'Layout draft');
  const width = requireDimension(draft.width, 'width');
  const height = requireDimension(draft.height, 'height');
  require(draft.bbox_coord_space === 'abs', 'Draft bbox_coord_space must be abs');
  require(draft.bbox_format === 'xyxy', 'Draft bbox_format must be xyxy');

  const summary = draft.summary;
  require(isRecord(summary), 'summary must be an object');
  checkFields(summary, SUMMARY_FIELDS, ['caption'], 'summary');
  requireText(summary.caption, 'summary.caption');
  if ('canvas' in summary) {
    require(
      typeof summary.canvas === 'string' && CANVAS_KINDS.includes(summary.canvas),
      'summary.canvas must be single, multi_panel or collage',
    );
  }
  for (const key of ['meta', 'palette']) {
    if (key in summary) requireStringArray(summary[key], `summary.${key}`);
  }

  const items = draft.items;
  require(Array.isArray(items) && items.length > 0, 'items must be a nonempty flat array');

  const compiledItems = items.map((rawItem, index) => {
    const location = `items[${index}]`;
    require(isRecord(rawItem), `${location} must be an object`);
    checkFields(rawItem, ITEM_FIELDS, ['label', 'caption', 'bbox'], location);
    require(
      typeof rawItem.label === 'string' && ITEM_LABELS.includes(rawItem.label),
      `${location}.label must be object, character or text`,
    );
    requireText(rawItem.caption, `${location}.caption`);
    if (rawItem.label === 'text') {
      require('text' in rawItem, `${location}: text items require literal text`);
    }
    if ('text' in rawItem) requireText(rawItem.text, `${location}.text`);
    for (const key of ['tags', 'palette']) {
      if (key in rawItem) requireStringArray(rawItem[key], `${location}.${key}`);
    }

    const compiled: Json = {};
    for (const [key, value] of Object.entries(rawItem)) {
      compiled[key] = key === 'bbox' ? centeredBox(value, width, height, `${location}.bbox`) : value;
    }
    return compiled;
  });

  return JSON.stringify({
    summary,
    items: compiledItems,
    bbox_coord_space: 'abs_centralized',
    bbox_format: 'yxyx',
  });
}
