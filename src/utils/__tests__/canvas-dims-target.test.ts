import { describe, it, expect } from 'vitest';

import { computeTargetCanvasSize, normalizeCanvasSize, ratiosMatch } from '../canvas-dims';

describe('computeTargetCanvasSize', () => {
  it('1:1 画板按目标尺寸直接返回正方', () => {
    expect(computeTargetCanvasSize(1024, 1024, 2048)).toEqual({ width: 2048, height: 2048 });
  });

  it('2:3 画板保持竖版比例（长边 = 目标尺寸，宽高都是 16 的倍数）', () => {
    const size = computeTargetCanvasSize(512, 768, 2048);
    expect(size.height).toBe(2048);
    expect(size.width % 16).toBe(0);
    expect(size.width).toBe(1360);
  });

  it('16:9 画板保持横版比例', () => {
    expect(computeTargetCanvasSize(512, 288, 1024)).toEqual({ width: 1024, height: 576 });
  });

  it('9:16 画板长边落在高度上', () => {
    const size = computeTargetCanvasSize(288, 512, 4096);
    expect(size.height).toBe(4096);
    expect(size.width).toBe(2304);
  });

  it('非法画板尺寸回落到正方形目标', () => {
    expect(computeTargetCanvasSize(0, 0, 2048)).toEqual({ width: 2048, height: 2048 });
  });
});

describe('normalizeCanvasSize', () => {
  it('范围内的模型尺寸原样采用（已是 16 的倍数）', () => {
    expect(normalizeCanvasSize(2048, 1152)).toEqual({ width: 2048, height: 1152 });
    expect(normalizeCanvasSize(1024, 1024)).toEqual({ width: 1024, height: 1024 });
  });

  it('非 16 倍数取整到最近的 16', () => {
    expect(normalizeCanvasSize(1000, 1000)).toEqual({ width: 1008, height: 1008 });
  });

  it('超过 4096 时等比缩放到上限', () => {
    expect(normalizeCanvasSize(8000, 4500)).toEqual({ width: 4096, height: 2304 });
  });

  it('小于 256 时等比放大到下限', () => {
    expect(normalizeCanvasSize(128, 128)).toEqual({ width: 256, height: 256 });
  });

  it('非法尺寸返回 null', () => {
    expect(normalizeCanvasSize(0, 1024)).toBeNull();
    expect(normalizeCanvasSize(-100, 1024)).toBeNull();
    expect(normalizeCanvasSize(Number.NaN, 1024)).toBeNull();
    expect(normalizeCanvasSize(1024, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('ratiosMatch', () => {
  it('同比例不同分辨率视为匹配', () => {
    expect(ratiosMatch(512, 768, 1360, 2048)).toBe(true);
    expect(ratiosMatch(1920, 1080, 1024, 576)).toBe(true);
  });

  it('比例不同则不匹配', () => {
    expect(ratiosMatch(512, 768, 2048, 2048)).toBe(false);
    expect(ratiosMatch(1024, 1024, 1920, 1080)).toBe(false);
  });
});
