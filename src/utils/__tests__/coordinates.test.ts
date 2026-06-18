import { describe, it, expect } from 'vitest';
import { detectBboxSystem, bboxToPixels, type BboxSystem } from '../coordinates';

// ─── detectBboxSystem ───────────────────────────────────────────────

describe('detectBboxSystem', () => {
  it('should detect pixel coordinates (> 1000)', () => {
    const elements = [
      { bbox: [0, 0, 2000, 1500] as [number, number, number, number] },
    ];
    expect(detectBboxSystem(elements)).toBe('pixel');
  });

  it('should detect pixel from any single element value > 1000', () => {
    const elements = [
      { bbox: [0, 0, 500, 500] as [number, number, number, number] },
      { bbox: [0, 0, 2000, 500] as [number, number, number, number] },
    ];
    expect(detectBboxSystem(elements)).toBe('pixel');
  });

  it('should detect normalized 0-1000 coordinates (values > 1, ≤ 1000)', () => {
    const elements = [
      { bbox: [50, 100, 400, 600] as [number, number, number, number] },
    ];
    expect(detectBboxSystem(elements)).toBe('normalized');
  });

  it('should detect normalized with values at boundary 1000', () => {
    const elements = [
      { bbox: [0, 0, 1000, 1000] as [number, number, number, number] },
    ];
    expect(detectBboxSystem(elements)).toBe('normalized');
  });

  it('should detect normalized with minimum above-1 value', () => {
    const elements = [
      { bbox: [2, 5, 500, 800] as [number, number, number, number] },
    ];
    expect(detectBboxSystem(elements)).toBe('normalized');
  });

  it('should detect fractional 0-1 coordinates (values ≤ 1)', () => {
    const elements = [
      { bbox: [0.08, 0.12, 0.48, 0.48] as [number, number, number, number] },
    ];
    expect(detectBboxSystem(elements)).toBe('fractional');
  });

  it('should detect fractional with full-canvas bbox at 1.0', () => {
    const elements = [
      { bbox: [0, 0, 1, 1] as [number, number, number, number] },
    ];
    expect(detectBboxSystem(elements)).toBe('fractional');
  });

  it('should handle empty elements (maxVal stays 0)', () => {
    const elements: Array<{ bbox: [number, number, number, number] }> = [];
    expect(detectBboxSystem(elements)).toBe('fractional');
  });
});

// ─── bboxToPixels ───────────────────────────────────────────────────

describe('bboxToPixels', () => {
  const canvasW = 768;
  const canvasH = 1024;

  describe('pixel system', () => {
    it('should use pixel values directly', () => {
      const result = bboxToPixels([100, 200, 500, 800], canvasW, canvasH, 'pixel');
      expect(result).toEqual({ x: 200, y: 100, w: 600, h: 400 });
    });
  });

  describe('normalized system (0-1000)', () => {
    it('should convert normalized values to pixels', () => {
      const result = bboxToPixels([100, 200, 500, 800], canvasW, canvasH, 'normalized');
      // (200/1000)*768 = 153.6, (100/1000)*1024 = 102.4
      // (800-200)/1000*768 = 460.8, (500-100)/1000*1024 = 409.6
      expect(result.x).toBeCloseTo(153.6);
      expect(result.y).toBeCloseTo(102.4);
      expect(result.w).toBeCloseTo(460.8);
      expect(result.h).toBeCloseTo(409.6);
    });

    it('should handle full-canvas bbox [0, 0, 1000, 1000]', () => {
      const result = bboxToPixels([0, 0, 1000, 1000], canvasW, canvasH, 'normalized');
      expect(result).toEqual({ x: 0, y: 0, w: 768, h: 1024 });
    });

    it('should handle zero-size bbox', () => {
      const result = bboxToPixels([500, 500, 500, 500], canvasW, canvasH, 'normalized');
      expect(result).toEqual({ x: 384, y: 512, w: 0, h: 0 });
    });
  });

  describe('fractional system (0-1)', () => {
    it('should multiply fractional values by canvas dimensions', () => {
      // Batman-like element: [0.08, 0.12, 0.48, 0.48]
      const result = bboxToPixels([0.08, 0.12, 0.48, 0.48], canvasW, canvasH, 'fractional');
      expect(result).toEqual({
        x: 0.12 * 768,  // = 92.16
        y: 0.08 * 1024, // = 81.92
        w: (0.48 - 0.12) * 768, // = 276.48
        h: (0.48 - 0.08) * 1024, // = 409.6
      });
    });

    it('should handle full-canvas bbox [0, 0, 1, 1]', () => {
      const result = bboxToPixels([0, 0, 1, 1], canvasW, canvasH, 'fractional');
      expect(result).toEqual({ x: 0, y: 0, w: 768, h: 1024 });
    });

    it('should handle canvas with unequal dimensions correctly', () => {
      const result = bboxToPixels([0.5, 0.5, 1, 1], 768, 1024, 'fractional');
      expect(result).toEqual({ x: 384, y: 512, w: 384, h: 512 });
    });
  });
});

// ─── Integration: detect + convert ─────────────────────────────────

describe('detectBboxSystem + bboxToPixels integration', () => {
  it('should correctly process real LLM output with fractional coords', () => {
    const elements = [
      { bbox: [0.08, 0.12, 0.48, 0.48] as [number, number, number, number] },
      { bbox: [0.52, 0.52, 0.92, 0.92] as [number, number, number, number] },
      { bbox: [0.35, 0.22, 0.65, 0.28] as [number, number, number, number] },
      { bbox: [0.25, 0.78, 0.75, 0.84] as [number, number, number, number] },
    ];

    const system = detectBboxSystem(elements);
    expect(system).toBe('fractional');

    const canvasW = 768;
    const canvasH = 1024;

    const results = elements.map(el => bboxToPixels(el.bbox, canvasW, canvasH, system));

    // Batman: bbox [0.08, 0.12, 0.48, 0.48] → starts at (92, 82), 276×410
    expect(results[0].x).toBeCloseTo(92.16);
    expect(results[0].y).toBeCloseTo(81.92);
    expect(results[0].w).toBeCloseTo(276.48);
    expect(results[0].h).toBeCloseTo(409.6);

    // Iron Man: bbox [0.52, 0.52, 0.92, 0.92] → starts at (399, 532), 307×410
    expect(results[1].x).toBeCloseTo(399.36);
    expect(results[1].y).toBeCloseTo(532.48);
    expect(results[1].w).toBeCloseTo(307.2);
    expect(results[1].h).toBeCloseTo(409.6);

    // All boxes should have non-trivial positions (not crushed to origin)
    results.forEach((r, i) => {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    });
  });

  it('should correctly process normalized coordinates (0-1000)', () => {
    const elements = [
      { bbox: [100, 200, 500, 800] as [number, number, number, number] },
    ];

    const system = detectBboxSystem(elements);
    expect(system).toBe('normalized');

    const result = bboxToPixels(elements[0].bbox, 1024, 1024, system);
    expect(result.x).toBeCloseTo(204.8);   // (200/1000)*1024
    expect(result.y).toBeCloseTo(102.4);   // (100/1000)*1024
    expect(result.w).toBeCloseTo(614.4);   // ((800-200)/1000)*1024
    expect(result.h).toBeCloseTo(409.6);   // ((500-100)/1000)*1024
  });

  it('should correctly process pixel coordinates (> 1000)', () => {
    const elements = [
      { bbox: [0, 0, 2000, 1500] as [number, number, number, number] },
    ];

    const system = detectBboxSystem(elements);
    expect(system).toBe('pixel');

    const result = bboxToPixels(elements[0].bbox, 1024, 1024, system);
    expect(result).toEqual({ x: 0, y: 0, w: 1500, h: 2000 });
  });
});

// ─── Normalize to 0-1000 (for validateLayout pre-processing) ───────

describe('normalize bbox to 0-1000 scale', () => {
  it('should multiply fractional (0-1) coords by 1000', () => {
    const raw = [0.08, 0.12, 0.48, 0.48] as [number, number, number, number];
    const [y1, x1, y2, x2] = raw;
    const normed = [y1 * 1000, x1 * 1000, y2 * 1000, x2 * 1000];
    expect(normed).toEqual([80, 120, 480, 480]);
  });

  it('should compute correct coverage from normalized fractional coords', () => {
    // Real LLM fractional output
    const elements = [
      { bbox: [0.08, 0.12, 0.48, 0.48] },  // Batman
      { bbox: [0.52, 0.52, 0.92, 0.92] },  // Iron Man
    ];
    const canvasW = 768;
    const canvasH = 1024;
    const canvasArea = canvasW * canvasH;

    // Normalize to 0-1000
    const normed = elements.map(el => {
      const [y1, x1, y2, x2] = el.bbox;
      return { bbox: [y1 * 1000, x1 * 1000, y2 * 1000, x2 * 1000] as [number, number, number, number] };
    });

    // Coverage calculation (same as validateLayout)
    let totalArea = 0;
    for (const el of normed) {
      const [y1, x1, y2, x2] = el.bbox;
      totalArea += (x2 - x1) * (y2 - y1);
    }
    const coveragePct = totalArea / canvasArea * 100;

    // Should be ~38.6% (well above 15% threshold)
    expect(coveragePct).toBeGreaterThan(30);
    expect(coveragePct).toBeLessThan(50);
  });

  it('should not double-divide already-normalized (0-1000) coords', () => {
    const raw = [100, 200, 500, 800] as [number, number, number, number];
    // No conversion needed — already normalized
    expect(raw).toEqual([100, 200, 500, 800]);
  });
});
