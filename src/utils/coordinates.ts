export function norm(val: number, max: number): number {
  return Math.min(1000, Math.max(0, Math.round((val / max) * 1000)));
}

export function denorm(val: number, max: number): number {
  return (val / 1000) * max;
}

/** bbox 坐标系统 */
export type BboxSystem = 'pixel' | 'normalized' | 'fractional';

/**
 * 检测 bbox 坐标系统：遍历所有 element 的 bbox，
 * 取最大值判断属于像素坐标、0-1000 归一化坐标、还是 0-1 分数坐标。
 */
export function detectBboxSystem(
  elements: ReadonlyArray<{ bbox: readonly [number, number, number, number] }>,
): BboxSystem {
  let maxVal = 0;
  for (const el of elements) {
    const [y1, x1, y2, x2] = el.bbox;
    if (x1 > maxVal) maxVal = x1;
    if (y1 > maxVal) maxVal = y1;
    if (x2 > maxVal) maxVal = x2;
    if (y2 > maxVal) maxVal = y2;
  }
  if (maxVal > 1000) return 'pixel';
  if (maxVal > 1) return 'normalized';
  return 'fractional';
}

/**
 * 将 bbox 转为像素坐标（x, y, w, h）。
 * 自动适配像素/0-1000归一化/0-1分数 三种系统。
 */
export function bboxToPixels(
  bbox: readonly [number, number, number, number],
  canvasW: number,
  canvasH: number,
  system: BboxSystem,
): { x: number; y: number; w: number; h: number } {
  const [y1, x1, y2, x2] = bbox;
  switch (system) {
    case 'pixel':
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    case 'normalized':
      return {
        x: (x1 / 1000) * canvasW,
        y: (y1 / 1000) * canvasH,
        w: ((x2 - x1) / 1000) * canvasW,
        h: ((y2 - y1) / 1000) * canvasH,
      };
    case 'fractional':
      return {
        x: x1 * canvasW,
        y: y1 * canvasH,
        w: (x2 - x1) * canvasW,
        h: (y2 - y1) * canvasH,
      };
  }
}