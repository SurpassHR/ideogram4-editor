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

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function simplifyRatio(w: number, h: number): { w: number; h: number } {
  const divisor = gcd(w, h);
  return {
    w: Math.max(1, Math.round(w / divisor)),
    h: Math.max(1, Math.round(h / divisor)),
  };
}

function fitCustomRatio(w: number, h: number): { w: number; h: number } {
  const simplified = simplifyRatio(w, h);
  const maxSide = Math.max(simplified.w, simplified.h);
  if (maxSide <= 32) return simplified;

  const factor = maxSide / 32;
  const fitted = {
    w: Math.max(1, Math.round(simplified.w / factor)),
    h: Math.max(1, Math.round(simplified.h / factor)),
  };
  return simplifyRatio(fitted.w, fitted.h);
}

export function inferCanvasControlsFromDimensions(w: number, h: number): {
  canvasRatio: RatioKey;
  canvasScale: number;
  canvasCustomW: number;
  canvasCustomH: number;
} {
  const safeW = Math.max(1, Math.round(w));
  const safeH = Math.max(1, Math.round(h));
  const simplified = simplifyRatio(safeW, safeH);
  const standardRatio = RATIO_KEYS
    .filter((key): key is Exclude<RatioKey, 'custom'> => key !== 'custom')
    .find(key => {
      const base = RATIO_BASES[key];
      const baseRatio = simplifyRatio(base.baseW, base.baseH);
      return baseRatio.w === simplified.w && baseRatio.h === simplified.h;
    });
  const customRatio = fitCustomRatio(safeW, safeH);

  return {
    canvasRatio: standardRatio ?? 'custom',
    canvasScale: Math.max(1, Math.min(16, Math.round(Math.max(safeW, safeH) / 256))),
    canvasCustomW: customRatio.w,
    canvasCustomH: customRatio.h,
  };
}

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
