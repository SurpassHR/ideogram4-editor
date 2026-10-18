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

/**
 * 归一化模型返回的画布尺寸：取整到 16 的倍数并收敛到 256–4096。
 * 越界时先等比缩放再取整，尽量保持比例；非法值（<=0 / NaN / Infinity）返回 null。
 */
export function normalizeCanvasSize(width: number, height: number): { width: number; height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  let w = width;
  let h = height;
  const maxSide = Math.max(w, h);
  if (maxSide > 4096) {
    const factor = 4096 / maxSide;
    w *= factor;
    h *= factor;
  }
  const minSide = Math.min(w, h);
  if (minSide < 256) {
    const factor = 256 / minSide;
    w *= factor;
    h *= factor;
  }

  return {
    width: Math.min(4096, Math.max(256, roundTo16(w))),
    height: Math.min(4096, Math.max(256, roundTo16(h))),
  };
}

/**
 * 按画板比例把「目标渲染尺寸」换算成宽高：
 * 长边等于 longSide，宽高都取 16 的倍数，避免把用户选好的比例变成 1:1。
 */
export function computeTargetCanvasSize(
  canvasW: number,
  canvasH: number,
  longSide: number,
): { width: number; height: number } {
  const safeLongSide = Math.max(16, roundTo16(longSide));
  if (!(canvasW > 0) || !(canvasH > 0)) {
    return { width: safeLongSide, height: safeLongSide };
  }
  const factor = safeLongSide / Math.max(canvasW, canvasH);
  const width = Math.max(16, roundTo16(canvasW * factor));
  const height = Math.max(16, roundTo16(canvasH * factor));
  // 保证长边严格等于目标尺寸（roundTo16 可能把长边挪动 8px）
  if (width >= height && width !== safeLongSide) {
    return { width: safeLongSide, height: Math.max(16, roundTo16((safeLongSide * canvasH) / canvasW)) };
  }
  if (height > width && height !== safeLongSide) {
    return { width: Math.max(16, roundTo16((safeLongSide * canvasW) / canvasH)), height: safeLongSide };
  }
  return { width, height };
}

/** 两组宽高是否为同一比例（默认 2% 容差，用于判断模型是否遵守了画板比例） */
export function ratiosMatch(
  aWidth: number,
  aHeight: number,
  bWidth: number,
  bHeight: number,
  tolerance = 0.02,
): boolean {
  if (!(aWidth > 0) || !(aHeight > 0) || !(bWidth > 0) || !(bHeight > 0)) return false;
  const ratioA = aWidth / aHeight;
  const ratioB = bWidth / bHeight;
  return Math.abs(ratioA - ratioB) / Math.max(ratioA, ratioB) <= tolerance;
}

/** 输出人类可读的比例标签：512×768 → "2:3"，1920×1080 → "16:9"，复杂比例 → "1.78:1" */
export function formatAspectRatio(width: number, height: number): string {
  if (!(width > 0) || !(height > 0)) return '1:1';
  const round = Math.round;
  const divisor = gcd(round(width), round(height)) || 1;
  const w = round(width) / divisor;
  const h = round(height) / divisor;
  if (w <= 32 && h <= 32) return `${w}:${h}`;
  return `${round((width / height) * 100) / 100}:1`;
}

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
