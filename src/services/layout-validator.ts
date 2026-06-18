import type { IdeogramElement } from '../types';

export interface LayoutValidationConfig {
  minElementArea: number;     // % of canvas, default 2
  minCoverage: number;        // % of canvas, default 15
  maxCoverage: number;        // % of canvas, default 60
  minGap: number;             // % of canvas short side, default 3
  minMargin: number;          // % of canvas short side, default 2
  maxAspectRatio: number;     // ratio, default 5
  minElementCount: number;    // default 1
  maxElementCount: number;    // default 8
}

export interface MetricResult {
  field: string;
  passed: boolean;
  actual: number | number[];
  threshold: string;
  message: string;
  detail?: string;
}

export interface LayoutQualityReport {
  overallPass: boolean;
  metrics: MetricResult[];
  summaryText: string;    // starts with "[Layout Feedback]\n", lines like "- coverage: 8% (threshold: 15-60%)"
  userSummary: string;    // Chinese-friendly summary
}

export function validateLayout(
  elements: IdeogramElement[],
  canvasW: number,
  canvasH: number,
  config?: Partial<LayoutValidationConfig>,
): LayoutQualityReport {
  const cfg: LayoutValidationConfig = {
    minElementArea: config?.minElementArea ?? 2,
    minCoverage: config?.minCoverage ?? 15,
    maxCoverage: config?.maxCoverage ?? 60,
    minGap: config?.minGap ?? 3,
    minMargin: config?.minMargin ?? 2,
    maxAspectRatio: config?.maxAspectRatio ?? 5,
    minElementCount: config?.minElementCount ?? 1,
    maxElementCount: config?.maxElementCount ?? 8,
  };

  const canvasArea = canvasW * canvasH;
  const shortSide = Math.min(canvasW, canvasH);
  const metrics: MetricResult[] = [];
  const failLines: string[] = [];
  const passLines: string[] = [];

  // ── 1. element_count ────────────────────────────────────────────────
  {
    const count = elements.length;
    const passed = count >= cfg.minElementCount && count <= cfg.maxElementCount;
    const threshold = `${cfg.minElementCount}-${cfg.maxElementCount}`;
    metrics.push({
      field: 'element_count',
      passed,
      actual: count,
      threshold,
      message: passed
        ? `element count OK (${count})`
        : count < cfg.minElementCount
          ? `no elements`
          : `too many elements (${count})`,
    });
    if (passed) {
      passLines.push(`element_count (${count})`);
    } else {
      failLines.push(
        count < cfg.minElementCount
          ? `element_count: 0 (threshold: ${threshold}) — no elements`
          : `element_count: ${count} (threshold: ${threshold}) — too many elements`,
      );
    }
  }

  // ── 2. element_area ─────────────────────────────────────────────────
  {
    const small: number[] = [];
    for (const el of elements) {
      const [y1, x1, y2, x2] = el.bbox;
      const w = x2 - x1;
      const h = y2 - y1;
      const areaPct = (w * h) / canvasArea * 100;
      if (areaPct < cfg.minElementArea) {
        small.push(areaPct);
      }
    }
    const passed = small.length === 0;
    const actual = small.length > 0
      ? (small.length === 1 ? [small[0]] : small.length <= 3 ? small : [...small.slice(0, 2), small[small.length - 1]])
      : elements.length > 0 ? elements.map(el => {
        const [y1, x1, y2, x2] = el.bbox;
        return (x2 - x1) * (y2 - y1) / canvasArea * 100;
      }) : [];
    metrics.push({
      field: 'element_area',
      passed,
      actual: Array.isArray(actual) ? actual : [actual],
      threshold: `\u2265 ${cfg.minElementArea}%`,
      message: passed ? `all elements large enough` : `${small.length} element(s) too small`,
      detail: small.length > 0
        ? small.map(v => `${v.toFixed(1)}%`).join(', ')
        : undefined,
    });
    if (passed) {
      passLines.push('element_area (OK)');
    } else {
      const vals = small.map(v => `${v.toFixed(1)}%`).join(', ');
      failLines.push(
        `element_area: ${small.length} element(s) too small (${vals}; threshold: \u2265 ${cfg.minElementArea}%)`,
      );
    }
  }

  // ── 3. coverage ─────────────────────────────────────────────────────
  {
    let totalArea = 0;
    for (const el of elements) {
      const [y1, x1, y2, x2] = el.bbox;
      totalArea += (x2 - x1) * (y2 - y1);
    }
    const coveragePct = totalArea / canvasArea * 100;
    const passed = coveragePct >= cfg.minCoverage && coveragePct <= cfg.maxCoverage;
    metrics.push({
      field: 'coverage',
      passed,
      actual: coveragePct,
      threshold: `${cfg.minCoverage}-${cfg.maxCoverage}%`,
      message: passed
        ? `coverage OK (${coveragePct.toFixed(1)}%)`
        : coveragePct < cfg.minCoverage
          ? `insufficient coverage (${coveragePct.toFixed(1)}%)`
          : `excessive coverage (${coveragePct.toFixed(1)}%)`,
    });
    if (passed) {
      passLines.push(`coverage (${coveragePct.toFixed(0)}%)`);
    } else {
      const direction = coveragePct < cfg.minCoverage ? 'insufficient coverage, spread elements' : 'excessive coverage, reduce elements';
      failLines.push(
        `coverage: ${coveragePct.toFixed(0)}% (threshold: ${cfg.minCoverage}-${cfg.maxCoverage}%) \u2014 ${direction}`,
      );
    }
  }

  // ── 4. spacing ──────────────────────────────────────────────────────
  {
    let minGapActual = Infinity;
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const a = elements[i].bbox;
        const b = elements[j].bbox;
        const [ay1, ax1, ay2, ax2] = a;
        const [by1, bx1, by2, bx2] = b;

        // Check overlap
        const overlapX = ax1 < bx2 && bx1 < ax2;
        const overlapY = ay1 < by2 && by1 < ay2;

        let gap: number;
        if (overlapX && overlapY) {
          gap = 0;
        } else if (overlapX) {
          // Stacked vertically
          gap = Math.max(ay1 - by2, by1 - ay2, 0);
        } else if (overlapY) {
          // Side by side horizontally
          gap = Math.max(ax1 - bx2, bx1 - ax2, 0);
        } else {
          // Diagonal — Euclidean distance
          const dx = Math.max(ax1 - bx2, bx1 - ax2, 0);
          const dy = Math.max(ay1 - by2, by1 - ay2, 0);
          gap = Math.sqrt(dx * dx + dy * dy);
        }
        minGapActual = Math.min(minGapActual, gap);
      }
    }
    // When fewer than 2 elements, spacing is trivially OK
    if (elements.length < 2) {
      minGapActual = Infinity;
    }
    const minGapPct = minGapActual === Infinity ? Infinity : (minGapActual / shortSide) * 100;
    const passed = minGapPct >= cfg.minGap;
    metrics.push({
      field: 'spacing',
      passed,
      actual: minGapPct === Infinity ? 0 : minGapPct,
      threshold: `\u2265 ${cfg.minGap}%`,
      message: passed
        ? elements.length < 2
          ? 'N/A (single element)'
          : `minimum spacing OK (${minGapPct.toFixed(1)}%)`
        : `elements too close or overlapping (${minGapPct.toFixed(1)}%)`,
    });
    if (passed) {
      passLines.push('spacing (OK)');
    } else {
      failLines.push(
        `spacing: ${minGapPct.toFixed(1)}% (threshold: \u2265 ${cfg.minGap}%) \u2014 elements too close or overlapping`,
      );
    }
  }

  // ── 5. margin ───────────────────────────────────────────────────────
  {
    let minMarginActual = Infinity;
    for (const el of elements) {
      const [y1, x1, y2, x2] = el.bbox;
      minMarginActual = Math.min(
        minMarginActual,
        x1,             // distance to left
        y1,             // distance to top
        canvasW - x2,   // distance to right
        canvasH - y2,   // distance to bottom
      );
    }
    const marginPct = minMarginActual === Infinity ? 0 : (minMarginActual / shortSide) * 100;
    const passed = marginPct >= cfg.minMargin;
    metrics.push({
      field: 'margin',
      passed,
      actual: marginPct,
      threshold: `\u2265 ${cfg.minMargin}%`,
      message: passed
        ? `minimum margin OK (${marginPct.toFixed(1)}%)`
        : `insufficient margin (${marginPct.toFixed(1)}%)`,
    });
    if (passed) {
      passLines.push('margin (OK)');
    } else {
      failLines.push(
        `margin: ${marginPct.toFixed(1)}% (threshold: \u2265 ${cfg.minMargin}%) \u2014 elements too close to canvas edge`,
      );
    }
  }

  // ── 6. aspect_ratio ─────────────────────────────────────────────────
  {
    const badAspect: { actual: number; label: string }[] = [];
    for (const el of elements) {
      const [y1, x1, y2, x2] = el.bbox;
      const w = x2 - x1;
      const h = y2 - y1;
      const ratio = w === 0 || h === 0 ? Infinity : Math.max(w / h, h / w);
      if (ratio > cfg.maxAspectRatio) {
        badAspect.push({ actual: ratio, label: `${w.toFixed(0)}:${h.toFixed(0)}` });
      }
    }
    const passed = badAspect.length === 0;
    metrics.push({
      field: 'aspect_ratio',
      passed,
      actual: badAspect.length > 0 ? badAspect.map(b => b.actual) : (elements.length > 0 ? [1] : [0]),
      threshold: `\u2264 ${cfg.maxAspectRatio}:1`,
      message: passed
        ? badAspect.length === 0 && elements.length > 0
          ? 'all aspect ratios OK'
          : 'N/A (no elements)'
        : `${badAspect.length} element(s) have extreme aspect ratio`,
    });
    if (passed) {
      passLines.push('aspect_ratio (all OK)');
    } else {
      const vals = badAspect.map(b => `${b.actual.toFixed(1)}:1`).join(', ');
      failLines.push(
        `aspect_ratio: ${badAspect.length} element(s) extreme (${vals}; threshold: \u2264 ${cfg.maxAspectRatio}:1)`,
      );
    }
  }

  const overallPass = metrics.every(m => m.passed);

  let summaryText = '[Layout Feedback]\n';
  if (failLines.length > 0) {
    summaryText += failLines.map(l => `- ${l}`).join('\n') + '\n';
  }
  summaryText += `Passed: ${passLines.length > 0 ? passLines.join(', ') : '(none)'}`;

  const userSummary = overallPass
    ? `布局质量良好：${elements.length} 个元素，覆盖 ${(metrics.find(m => m.field === 'coverage')?.actual ?? 0).toFixed(0)}% 画布区域，间距和边距均符合要求`
    : `布局需要调整：${failLines.length} 项指标未通过 (${failLines.join('; ')})`;

  return { overallPass, metrics, summaryText, userSummary };
}
