/** bbox 归一化助手 — 各 adapter 共用。 */

import type { BboxSystem } from '../../utils/coordinates';

export type Bbox = [number, number, number, number];

export function clamp1000(value: number): number {
  return Math.min(1000, Math.max(0, Math.round(value)));
}

/** 把任意坐标系（pixel / 0-1 / 0-1000）的 bbox 统一成 0-1000 的 yxyx */
export function normalizeBboxTo1000(
  bbox: readonly [number, number, number, number],
  system: BboxSystem,
  canvasW: number,
  canvasH: number,
): Bbox {
  const [y1, x1, y2, x2] = bbox;
  switch (system) {
    case 'pixel': {
      const w = canvasW > 0 ? canvasW : 1000;
      const h = canvasH > 0 ? canvasH : 1000;
      return [
        clamp1000((y1 / h) * 1000),
        clamp1000((x1 / w) * 1000),
        clamp1000((y2 / h) * 1000),
        clamp1000((x2 / w) * 1000),
      ];
    }
    case 'fractional':
      return [clamp1000(y1 * 1000), clamp1000(x1 * 1000), clamp1000(y2 * 1000), clamp1000(x2 * 1000)];
    case 'normalized':
    default:
      return [clamp1000(y1), clamp1000(x1), clamp1000(y2), clamp1000(x2)];
  }
}
