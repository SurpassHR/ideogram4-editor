export const RATIO_KEYS = ['1:1', '16:9', '9:16', '4:3', '3:2', '2:1', 'custom'] as const;
export type RatioKey = typeof RATIO_KEYS[number];

export const RATIO_BASES: Record<RatioKey, { baseW: number; baseH: number }> = {
  '1:1': { baseW: 256, baseH: 256 },
  '16:9': { baseW: 256, baseH: 144 },
  '9:16': { baseW: 144, baseH: 256 },
  '4:3': { baseW: 256, baseH: 192 },
  '3:2': { baseW: 240, baseH: 160 },
  '2:1': { baseW: 256, baseH: 128 },
  custom: { baseW: 256, baseH: 256 },
};

export const roundTo16 = (n: number) => Math.round(n / 16) * 16;
export const clampDim = (n: number) => Math.max(256, Math.min(4096, roundTo16(n)));

export function computeCanvasDims(ratio: RatioKey, scale: number, customW: number, customH: number) {
  let baseW: number;
  let baseH: number;
  if (ratio === 'custom') {
    const maxDim = Math.max(customW, customH, 1);
    baseW = (256 * customW) / maxDim;
    baseH = (256 * customH) / maxDim;
  } else {
    const bases = RATIO_BASES[ratio];
    baseW = bases.baseW;
    baseH = bases.baseH;
  }
  return {
    w: clampDim(baseW * scale),
    h: clampDim(baseH * scale),
  };
}
