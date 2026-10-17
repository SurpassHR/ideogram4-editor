import { describe, it, expect } from 'vitest';

import { computeTargetCanvasSize, ratiosMatch } from '../canvas-dims';

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
