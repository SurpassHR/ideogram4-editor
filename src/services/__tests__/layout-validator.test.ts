import { describe, it, expect } from 'vitest';
import { validateLayout } from '../layout-validator';
import type { IdeogramElement } from '../../types';

function el(bbox: [number, number, number, number]): IdeogramElement {
  return { type: 'obj', bbox, desc: 'test' };
}

const W = 1000;
const H = 1000;

describe('validateLayout', () => {
  it('4 evenly distributed large elements should pass all metrics', () => {
    const elements: IdeogramElement[] = [
      el([20, 20, 320, 320]),   // 9% of canvas, with 20px margin
      el([20, 520, 320, 820]),  // 9%
      el([520, 20, 820, 320]),  // 9%
      el([520, 520, 820, 820]), // 9% — total 36%, within 15-60%
    ];
    const r = validateLayout(elements, W, H);
    expect(r.overallPass).toBe(true);
    expect(r.metrics.every(m => m.passed)).toBe(true);
  });

  it('one tiny element (0.04% area) should fail element_area', () => {
    // 20×20 = 400 px² out of 1e6 = 0.04%
    const elements = [el([0, 0, 20, 20])];
    const r = validateLayout(elements, W, H);
    expect(r.overallPass).toBe(false);
    const areaMetric = r.metrics.find(m => m.field === 'element_area');
    expect(areaMetric?.passed).toBe(false);
    // actual is an array of small area percentages
    expect(Array.isArray(areaMetric?.actual)).toBe(true);
    expect((areaMetric?.actual as number[])[0]).toBeLessThan(2);
  });

  it('1 element at 1% coverage should fail coverage (too low)', () => {
    // 100×100 = 10000 px² = 1%
    const elements = [el([0, 0, 100, 100])];
    const r = validateLayout(elements, W, H);
    expect(r.overallPass).toBe(false);
    const covMetric = r.metrics.find(m => m.field === 'coverage');
    expect(covMetric?.passed).toBe(false);
  });

  it('3 elements at 75% total coverage should fail coverage (too high)', () => {
    // 75% = 750,000 px². Use three 25% strips: 250×1000 = 250k each
    const elements = [
      el([0, 0, 250, 1000]),   // 25%
      el([250, 0, 500, 1000]), // 25%
      el([500, 0, 750, 1000]), // 25%
    ];
    const r = validateLayout(elements, W, H);
    expect(r.overallPass).toBe(false);
    const covMetric = r.metrics.find(m => m.field === 'coverage');
    expect(covMetric?.passed).toBe(false);
  });

  it('two overlapping elements should fail spacing', () => {
    const elements = [
      el([0, 0, 200, 200]),
      el([100, 100, 300, 300]), // overlaps the first
    ];
    const r = validateLayout(elements, W, H);
    expect(r.overallPass).toBe(false);
    const spacingMetric = r.metrics.find(m => m.field === 'spacing');
    expect(spacingMetric?.passed).toBe(false);
  });

  it('element 5px from edge (0.5%) should fail margin', () => {
    const elements = [el([5, 5, 400, 400])]; // 5px from top/left = 0.5% of 1000
    const r = validateLayout(elements, W, H);
    expect(r.overallPass).toBe(false);
    const marginMetric = r.metrics.find(m => m.field === 'margin');
    expect(marginMetric?.passed).toBe(false);
  });

  it('element with 100:1 aspect ratio should fail aspect_ratio', () => {
    const elements = [el([0, 0, 10, 1000])]; // h=10, w=1000 → 100:1
    const r = validateLayout(elements, W, H);
    expect(r.overallPass).toBe(false);
    const arMetric = r.metrics.find(m => m.field === 'aspect_ratio');
    expect(arMetric?.passed).toBe(false);
  });

  it('empty elements array should fail element_count', () => {
    const r = validateLayout([], W, H);
    expect(r.overallPass).toBe(false);
    const countMetric = r.metrics.find(m => m.field === 'element_count');
    expect(countMetric?.passed).toBe(false);
    expect(countMetric?.actual).toBe(0);
  });

  it('9 elements should fail element_count', () => {
    const elements = Array.from({ length: 9 }, (_, i) =>
      el([i * 100, 0, i * 100 + 50, 50])
    );
    const r = validateLayout(elements, W, H);
    expect(r.overallPass).toBe(false);
    const countMetric = r.metrics.find(m => m.field === 'element_count');
    expect(countMetric?.passed).toBe(false);
    expect(countMetric?.actual).toBe(9);
  });

  it('custom config (minCoverage=5, maxCoverage=90) with 4% coverage should fail', () => {
    // 4% = 40,000 px²
    const elements = [el([0, 0, 200, 200])]; // 4%
    const r = validateLayout(elements, W, H, { minCoverage: 5, maxCoverage: 90 });
    // 4% < 5% minCoverage → coverage fail
    expect(r.overallPass).toBe(false);
    const covMetric = r.metrics.find(m => m.field === 'coverage');
    expect(covMetric?.passed).toBe(false);
  });

  it('report has summaryText with correct format', () => {
    const elements = [el([0, 0, 400, 400])];
    const r = validateLayout(elements, W, H);
    expect(r.summaryText).toMatch(/coverage/);
    expect(r.summaryText).toMatch(/Passed:/);
    expect(r.userSummary.length).toBeGreaterThan(0);
  });

  it('non-overlapping elements with good spacing should pass spacing', () => {
    // Elements placed 100px apart (10% of short side, well above 3% threshold)
    const elements = [
      el([0, 0, 300, 300]),
      el([0, 400, 300, 700]), // y-gap = 100px (10%)
    ];
    const r = validateLayout(elements, W, H);
    const spacingMetric = r.metrics.find(m => m.field === 'spacing');
    expect(spacingMetric?.passed).toBe(true);
  });

  it('coverage format in summaryText matches expected pattern', () => {
    const elements = [el([0, 0, 80, 100])]; // 0.8% coverage
    const r = validateLayout(elements, W, H);
    expect(r.summaryText).toMatch(/coverage: [0-9.]+%/);
  });

  it('custom config with 6% coverage and minCoverage=5 should pass coverage', () => {
    const elements = [el([20, 20, 265, 265])]; // ~6% of 1e6, with 20px margin
    const r = validateLayout(elements, W, H, { minCoverage: 5, maxCoverage: 90 });
    expect(r.overallPass).toBe(true);
  });
});
