# Canvas Chat Layout Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hard/soft layout validation + feedback loop to Canvas Chat, improving LLM-generated composition quality.

**Architecture:** Introduce a pure-function `LayoutValidator` service for 6 metrics, integrate it into `sendMessage` with automatic retry on JSON parse failure and user-prompted retry on quality failure, optimize system prompt with concrete constraints and a retry protocol.

**Tech Stack:** TypeScript, Zustand 5, Vitest + testing-library

**Spec:** `docs/superpowers/specs/2026-06-18-canvas-chat-quality-design.md`

## Global Constraints

- LayoutValidator MUST be a pure function with zero React/Zustand imports
- Default thresholds in LayoutValidator MUST match the constraints documented in the system prompt
- Hard retry max = 2 attempts, no backoff delay
- Soft validation MUST use a non-blocking dialog (not a blocking modal)
- All existing tests MUST continue to pass after changes
- New service MUST have complete test coverage (all 8+ cases from spec)
- i18n: Chinese strings for layout quality messages, English defaults

---

### Task 1: LayoutValidator Service + Tests

**Files:**
- Create: `src/services/layout-validator.ts`
- Create: `src/services/__tests__/layout-validator.test.ts`

**Interfaces:**
- Produces: `LayoutValidationConfig`, `MetricResult`, `LayoutQualityReport` types, `validateLayout()` function

- [ ] **Step 1: Write the failing tests**

```typescript
// src/services/__tests__/layout-validator.test.ts
import { describe, it, expect } from 'vitest';
import { validateLayout, type LayoutValidationConfig } from '../layout-validator';
import type { IdeogramElement } from '../../types';

// Helper: build an element
function el(bbox: [number, number, number, number], overrides: Partial<IdeogramElement> = {}): IdeogramElement {
  return { type: 'obj', desc: 'test', ...overrides, bbox };
}

describe('validateLayout', () => {
  // --- 正向：全部通过 ---
  it('4 evenly distributed large elements pass all checks', () => {
    const elements = [
      el([50, 50, 450, 450]),   // top-left, ~16% area
      el([50, 550, 450, 950]),  // top-right, ~16% area
      el([550, 50, 950, 450]),  // bottom-left, ~16% area
      el([550, 550, 950, 950]), // bottom-right, ~16% area
    ];
    const result = validateLayout(elements, 1000, 1000);
    expect(result.overallPass).toBe(true);
    expect(result.metrics.every(m => m.passed)).toBe(true);
  });

  // --- min area ---
  it('detects element that is too small', () => {
    const elements = [
      el([490, 490, 510, 510]), // 20x20 = 400px = 0.04% of 1000x1000
      el([50, 50, 550, 550]),   // large element, ~25% area
    ];
    const result = validateLayout(elements, 1000, 1000);
    expect(result.overallPass).toBe(false);
    const areaMetric = result.metrics.find(m => m.field === 'element_area');
    expect(areaMetric?.passed).toBe(false);
  });

  // --- coverage too low ---
  it('detects insufficient coverage', () => {
    const elements = [
      el([350, 350, 450, 450]), // 100x100 = 1% of 1000x1000
    ];
    const result = validateLayout(elements, 1000, 1000);
    expect(result.overallPass).toBe(false);
    const coverageMetric = result.metrics.find(m => m.field === 'coverage');
    expect(coverageMetric?.passed).toBe(false);
  });

  // --- coverage too high ---
  it('detects excessive coverage (elements too large)', () => {
    // 3 elements each covering ~25% = 75% total > 60%
    const elements = [
      el([0, 0, 500, 500]),
      el([500, 0, 1000, 500]),
      el([0, 500, 500, 1000]),
    ];
    const result = validateLayout(elements, 1000, 1000);
    expect(result.overallPass).toBe(false);
    const cov = result.metrics.find(m => m.field === 'coverage');
    expect(cov?.passed).toBe(false);
  });

  // --- spacing: overlapping ---
  it('detects overlapping elements (zero spacing)', () => {
    // Two elements that overlap significantly
    const elements = [
      el([100, 100, 400, 400]),
      el([200, 200, 500, 500]), // overlaps with first
    ];
    const result = validateLayout(elements, 1000, 1000);
    expect(result.overallPass).toBe(false);
    const spacing = result.metrics.find(m => m.field === 'spacing');
    expect(spacing?.passed).toBe(false);
  });

  // --- margin: too close to edge ---
  it('detects elements too close to canvas edge', () => {
    const elements = [
      el([5, 5, 200, 200]), // top-left corner, 5px from edge (0.5% of 1000)
    ];
    const result = validateLayout(elements, 1000, 1000);
    expect(result.overallPass).toBe(false);
    const margin = result.metrics.find(m => m.field === 'margin');
    expect(margin?.passed).toBe(false);
  });

  // --- aspect ratio ---
  it('detects excessively narrow/wide element', () => {
    // bbox: 10 height x 1000 width = aspect ratio 100:1
    const elements = [
      el([495, 0, 505, 1000]),
    ];
    const result = validateLayout(elements, 1000, 1000);
    expect(result.overallPass).toBe(false);
    const ar = result.metrics.find(m => m.field === 'aspect_ratio');
    expect(ar?.passed).toBe(false);
  });

  // --- element count ---
  it('rejects empty elements array', () => {
    const result = validateLayout([], 1000, 1000);
    expect(result.overallPass).toBe(false);
    const ec = result.metrics.find(m => m.field === 'element_count');
    expect(ec?.passed).toBe(false);
  });

  it('rejects more than max elements', () => {
    const elements = Array.from({ length: 9 }, (_, i) =>
      el([i * 100, 0, i * 100 + 80, 80])
    );
    const result = validateLayout(elements, 1000, 1000);
    expect(result.overallPass).toBe(false);
    const ec = result.metrics.find(m => m.field === 'element_count');
    expect(ec?.passed).toBe(false);
  });

  // --- custom config ---
  it('respects custom config overrides', () => {
    const config: Partial<LayoutValidationConfig> = { minCoverage: 5, maxCoverage: 90 };
    const elements = [
      el([350, 350, 550, 550]), // 4% coverage — would fail default (15-60%) but passes custom (5-90%)
    ];
    const result = validateLayout(elements, 1000, 1000, config);
    expect(result.overallPass).toBe(true);
  });

  // --- summaryText format ---
  it('generates structured summaryText for LLM feedback', () => {
    const elements = [
      el([490, 490, 510, 510]), // tiny
      el([0, 0, 30, 30),       // also tiny + corner
    ];
    const result = validateLayout(elements, 1000, 1000);
    expect(result.summaryText).toContain('[Layout Feedback]');
    expect(result.summaryText).toContain('element_area');
    expect(result.summaryText).toContain('coverage');
    expect(result.summaryText).toContain('margin');
    expect(result.summaryText).toContain('Passed:');
  });
});
```

Note: The test above uses `el([490, 490, 510, 510])` with comma inside parens — make sure this parses correctly when writing the actual test file. Also ensure the second-to-last test's `bbox` on the tiny element is syntactically correct (`el([0, 0, 30, 30])` with closing `]` not `)`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/__tests__/layout-validator.test.ts 2>&1 | head -30`
Expected: FAIL — all tests fail with "module not found"

- [ ] **Step 3: Implement LayoutValidator service**

```typescript
// src/services/layout-validator.ts
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
  summaryText: string;
  userSummary: string;
}

const DEFAULTS: LayoutValidationConfig = {
  minElementArea: 2,
  minCoverage: 15,
  maxCoverage: 60,
  minGap: 3,
  minMargin: 2,
  maxAspectRatio: 5,
  minElementCount: 1,
  maxElementCount: 8,
};

function area(w: number, h: number): number {
  return w * h;
}

function shortSide(canvasW: number, canvasH: number): number {
  return Math.min(canvasW, canvasH);
}

function toCanvasCoords(bbox: [number, number, number, number], canvasW: number, canvasH: number) {
  const [y1, x1, y2, x2] = bbox;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function aspectRatio(w: number, h: number): number {
  if (w === 0 || h === 0) return Infinity;
  return w >= h ? w / h : h / w;
}

/** Minimum edge-to-edge distance between two rectangles. Returns Infinity if they overlap. */
function minEdgeDist(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number
): number {
  const aRight = ax + aw;
  const aBottom = ay + ah;
  const bRight = bx + bw;
  const bBottom = by + bh;

  const overlapX = Math.min(aRight, bRight) > Math.max(ax, bx);
  const overlapY = Math.min(aBottom, bBottom) > Math.max(ay, by);

  if (overlapX && overlapY) return 0; // overlapping

  const dx = overlapX ? 0 : (ax <= bRight ? (bRight > ax ? bRight - ax : aRight - bx) : aRight - bx);
  // Simpler: distance between intervals on each axis
  const xDist = aRight <= bx ? bx - aRight : (bRight <= ax ? ax - bRight : 0);
  const yDist = aBottom <= by ? by - aBottom : (bBottom <= ay ? ay - bBottom : 0);

  if (overlapX) return yDist;
  if (overlapY) return xDist;
  return Math.sqrt(xDist * xDist + yDist * yDist);
}

export function validateLayout(
  elements: IdeogramElement[],
  canvasW: number,
  canvasH: number,
  config?: Partial<LayoutValidationConfig>
): LayoutQualityReport {
  const cfg = { ...DEFAULTS, ...config };
  const canvasArea = canvasW * canvasH;
  const ss = shortSide(canvasW, canvasH);
  const metrics: MetricResult[] = [];
  const failedFields: string[] = [];

  // Compute per-element data
  const elData = elements.map(e => {
    const c = toCanvasCoords(e.bbox, canvasW, canvasH);
    return { ...c, area: area(c.w, c.h) };
  });

  // 1. element_count
  {
    const count = elements.length;
    const passed = count >= cfg.minElementCount && count <= cfg.maxElementCount;
    const field = 'element_count';
    if (!passed) failedFields.push(field);
    metrics.push({
      field,
      passed,
      actual: count,
      threshold: `${cfg.minElementCount}-${cfg.maxElementCount}`,
      message: count < cfg.minElementCount
        ? `Need at least ${cfg.minElementCount} element(s), got ${count}`
        : `Max ${cfg.maxElementCount} elements allowed, got ${count}`,
    });
  }

  // 2. element_area (per element)
  {
    const tooSmall = elData.filter(d => (d.area / canvasArea) * 100 < cfg.minElementArea);
    const passed = tooSmall.length === 0;
    const field = 'element_area';
    if (!passed) failedFields.push(field);
    metrics.push({
      field,
      passed,
      actual: tooSmall.map(d => Math.round((d.area / canvasArea) * 1000) / 10),
      threshold: `≥ ${cfg.minElementArea}%`,
      message: tooSmall.length === 0
        ? 'All elements meet minimum area requirement'
        : `${tooSmall.length} element(s) below minimum area`,
      detail: tooSmall.length > 0
        ? tooSmall.map(d =>
            `Element at (${Math.round(d.x)},${Math.round(d.y)}) area=${Math.round((d.area / canvasArea) * 1000) / 10}%`
          ).join('; ')
        : undefined,
    });
  }

  // 3. coverage
  {
    const totalArea = elData.reduce((s, d) => s + d.area, 0);
    const pct = (totalArea / canvasArea) * 100;
    const passed = pct >= cfg.minCoverage && pct <= cfg.maxCoverage;
    const field = 'coverage';
    if (!passed) failedFields.push(field);
    metrics.push({
      field,
      passed,
      actual: Math.round(pct * 10) / 10,
      threshold: `${cfg.minCoverage}%-${cfg.maxCoverage}%`,
      message: passed ? 'Coverage within range' : `${Math.round(pct * 10) / 10}% (expected ${cfg.minCoverage}%-${cfg.maxCoverage}%)`,
    });
  }

  // 4. spacing (pairwise)
  if (elData.length >= 2) {
    let minGapActual = Infinity;
    for (let i = 0; i < elData.length; i++) {
      for (let j = i + 1; j < elData.length; j++) {
        const a = elData[i];
        const b = elData[j];
        const dist = minEdgeDist(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h);
        if (dist < minGapActual) minGapActual = dist;
      }
    }
    const gapPct = (minGapActual / ss) * 100;
    const passed = gapPct >= cfg.minGap;
    const field = 'spacing';
    if (!passed) failedFields.push(field);
    metrics.push({
      field,
      passed,
      actual: Math.round(gapPct * 10) / 10,
      threshold: `≥ ${cfg.minGap}% of short side`,
      message: passed ? 'Elements have adequate spacing' : `Minimum element gap ${Math.round(gapPct * 10) / 10}% (expected ≥ ${cfg.minGap}%)`,
    });
  } else {
    metrics.push({
      field: 'spacing',
      passed: true,
      actual: 0,
      threshold: `≥ ${cfg.minGap}%`,
      message: 'Skipped: 0 or 1 element(s)',
    });
  }

  // 5. margin (edge distance)
  {
    let minMarginActual = Infinity;
    for (const d of elData) {
      const edges = [d.x, d.y, canvasW - (d.x + d.w), canvasH - (d.y + d.h)];
      const m = Math.min(...edges);
      if (m < minMarginActual) minMarginActual = m;
    }
    const marginPct = (minMarginActual / ss) * 100;
    const passed = marginPct >= cfg.minMargin;
    const field = 'margin';
    if (!passed) failedFields.push(field);
    metrics.push({
      field,
      passed,
      actual: Math.round(marginPct * 10) / 10,
      threshold: `≥ ${cfg.minMargin}% of short side`,
      message: passed ? 'Elements have adequate margin from edges' : `Minimum margin ${Math.round(marginPct * 10) / 10}% (expected ≥ ${cfg.minMargin}%)`,
    });
  }

  // 6. aspect_ratio
  {
    const badAspect = elData.filter(d => aspectRatio(d.w, d.h) > cfg.maxAspectRatio);
    const passed = badAspect.length === 0;
    const field = 'aspect_ratio';
    if (!passed) failedFields.push(field);
    metrics.push({
      field,
      passed,
      actual: badAspect.length,
      threshold: `≤ ${cfg.maxAspectRatio}:1`,
      message: passed ? 'All elements have acceptable aspect ratios' : `${badAspect.length} element(s) exceed max aspect ratio`,
    });
  }

  const overallPass = failedFields.length === 0;

  // Build summaryText (for LLM feedback)
  const failedLines = metrics
    .filter(m => !m.passed)
    .map(m => `- ${m.field}: ${m.message} ${m.detail ? '(' + m.detail + ')' : ''}`);

  const passedLines = metrics
    .filter(m => m.passed)
    .map(m => m.field);

  const summaryText = `[Layout Feedback]\n${failedLines.join('\n')}${failedLines.length > 0 && passedLines.length > 0 ? '\n' : ''}Passed: ${passedLines.join(', ')}`;

  // Build userSummary (Chinese for Chinese UI)
  const userFailedLines = metrics
    .filter(m => !m.passed)
    .map(m => `- ${m.message}`);
  const userSummary = overallPass
    ? '布局质量检测通过。'
    : '布局存在以下问题：\n' + userFailedLines.join('\n');

  return { overallPass, metrics, summaryText, userSummary };
}
```

<small>*(minEdgeDist is intentionally simplified — non-overlapping rectangles on separate axes use Euclidean distance. Overlapping rectangles report 0 gap. The coordinate system is 0-1000 normalized, so canvasW/canvasH parameters represent the normalized space. All distance computations happen in normalized space and are then converted to percentages.)*</small>

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/__tests__/layout-validator.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/layout-validator.ts src/services/__tests__/layout-validator.test.ts
git commit -m "feat: add layout validation service with 6 quality metrics"
```

---

### Task 2: Store + i18n Changes

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: `LayoutQualityReport` (from Task 1)
- Produces: Store `pendingQualityReport` field + `setPendingQualityReport` action; i18n keys `layoutQuality.*`

- [ ] **Step 1: Add store field**

Read `src/store/index.ts` to find the right insertion point for the new field. Add:

```typescript
import type { LayoutQualityReport } from '../services/layout-validator';
```

Inside the store interface/state type:

```typescript
pendingQualityReport: LayoutQualityReport | null;
```

Inside the actions:

```typescript
setPendingQualityReport: (report: LayoutQualityReport | null) => void;
```

Inside the `create` call:

```typescript
pendingQualityReport: null,
setPendingQualityReport: (report) => set({ pendingQualityReport: report }),
```

- [ ] **Step 2: Run existing tests to confirm no regression**

Run: `npx vitest run src/store/__tests__/`
Expected: ALL PASS

- [ ] **Step 3: Add i18n entries**

Read `src/i18n/translations.ts` and add under a new `layoutQuality` section:

```typescript
// In translations.ts
layoutQuality: {
  title: {
    en: 'Layout Quality Check',
    zh: '布局质量检测',
  },
  pass: {
    en: 'Layout check passed.',
    zh: '布局质量检测通过。',
  },
  fail: {
    en: 'Layout issues detected:',
    zh: '布局存在以下问题：',
  },
  accept: {
    en: 'Accept Current Layout',
    zh: '接受当前布局',
  },
  regenerate: {
    en: 'Regenerate',
    zh: '重新生成',
  },
  // metric labels for display
  metric: {
    element_area: { en: 'Element Size', zh: '元素大小' },
    coverage: { en: 'Canvas Coverage', zh: '画布覆盖率' },
    spacing: { en: 'Element Spacing', zh: '元素间距' },
    margin: { en: 'Canvas Margin', zh: '边缘距离' },
    element_count: { en: 'Element Count', zh: '元素数量' },
    aspect_ratio: { en: 'Aspect Ratio', zh: '宽高比' },
  },
},
```

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts src/i18n/translations.ts
git commit -m "feat: add pendingQualityReport store field and layout quality i18n keys"
```

---

### Task 3: System Prompt Optimization + Feedback Builder

**Files:**
- Modify: `src/services/llm-canvas-chat.ts`

**Interfaces:**
- Produces: `buildLayoutFeedbackPrompt(feedback: string): string` (exported function)

- [ ] **Step 1: Add feedback prompt builder**

Add after the existing `CANVAS_CHAT_SYSTEM_PROMPT`:

```typescript
/**
 * 构建布局反馈提示文本，追加到 user message 中用于重试。
 * feedback: validateLayout() 返回的 summaryText
 */
export function buildLayoutFeedbackPrompt(feedback: string): string {
  return `\n\n[Layout Feedback]\nThe previous composition had layout quality issues. Please generate an improved version addressing each point:\n\n${feedback}\n\nReturn your complete revised composition as a new \`\`\`json code block.`;
}
```

- [ ] **Step 2: Optimize system prompt**

Replace the `## Constraints` and `## Output Format` sections in `CANVAS_CHAT_SYSTEM_PROMPT`. Read the current file, then make these changes:

1. Replace the vague "Design a balanced composition" text with specific numerical constraints matching the validator defaults
2. Add the design principles (rule of thirds, visual anchor, breathing room, size rhythm)
3. Add the Retry Protocol section
4. Add a good/bad layout example pair

The modified prompt should include (insert after the JSON Schema or replace the `## Constraints` section):

```
## Constraints

### Numerical Layout Rules
- Each element area ≥ 2% of total canvas area (elements too small will be rejected)
- Total element coverage: 15%-60% of canvas (too little = empty, too much = crowded)
- Minimum gap between elements: ≥ 3% of the canvas short side
- Minimum margin from canvas edge: ≥ 2% of the canvas short side
- Element aspect ratio (w/h or h/w, whichever is larger): ≤ 5:1
- Recommended element count: 2-6 (max 8)

### Design Principles
- Rule of thirds: place key elements along 1/3 and 2/3 grid lines
- Visual anchor: at least one element should occupy ≥ 15% of canvas area as the primary focal point
- Breathing room: leave adequate whitespace between elements for visual clarity
- Size rhythm: vary element sizes with a max/min ratio ≤ 8:1 for visual interest
- Avoid clustering elements in one region — spread them across the canvas

## Retry Protocol

When you receive a [Layout Feedback] section in the user's message, it means
your previous composition was rejected. The feedback itemizes every issue by
metric name. Address each issue specifically:
- element_area: elements too small → increase dimensions
- coverage: insufficient/en excessive coverage → adjust element sizes and distribution
- spacing: elements too close → add breathing room
- margin: elements too close to edge → push them inward
- aspect_ratio: element too narrow/wide → reshape
- element_count: too many/few → add/remove elements

Do NOT return partial or truncated JSON. Re-submit your entire composition.
```

- [ ] **Step 3: Run existing tests to confirm no regression**

Run: `npx vitest run src/services/__tests__/llm-canvas-chat.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/services/llm-canvas-chat.ts
git commit -m "feat: optimize canvas chat system prompt with layout constraints and retry protocol"
```

---

### Task 4: Hard Retry in useCanvasChat

**Files:**
- Modify: `src/hooks/useCanvasChat.ts`

**Interfaces:**
- Consumes: `sendChatMessage`, `buildLayoutFeedbackPrompt` (from Task 3), existing `extractAndValidateIdeogramJSON`
- Produces: Modified `sendMessage` with auto-retry on parse failure

- [ ] **Step 1: Read current `sendMessage` and identify insertion points**

Read `src/hooks/useCanvasChat.ts` lines 72-210, focusing on the `sendMessage` function body.

- [ ] **Step 2: Add retry logic to sendMessage**

The key change: wrap the LLM call + extract logic so that when `extractAndValidateIdeogramJSON` returns null, it retries up to 2 times with error feedback.

Modified flow within `sendMessage`:

```typescript
const sendMessage = useCallback(async (content: string, retryContext?: { feedback?: string }) => {
  const userMessage = createUserMessage(content);
  addCanvasChatMessage(userMessage);
  setIsLoading(true);

  const provider = getCurrentProvider();
  if (!provider) {
    addCanvasChatMessage(createAssistantMessage('No LLM provider selected.'));
    setIsLoading(false);
    return;
  }

  const parsed = parseModel(chatModel);
  if (!parsed) {
    addCanvasChatMessage(createAssistantMessage('No model selected.'));
    setIsLoading(false);
    return;
  }

  try {
    const snapshot = {
      boxes: boxes.map(b => ({
        x: b.x, y: b.y, w: b.w, h: b.h,
        mode: b.mode, text: b.text, desc: b.desc,
        colors: b.colors, imageDataUrl: b.imageDataUrl, imageRole: b.imageRole,
      })),
      canvasW, canvasH, globalPalette, highLevelDescription,
      aesthetics, lighting, medium, artStyle, background, photoArtStyleMode,
    };
    const contextJson = buildCanvasChatContext(snapshot);

    // 硬校验重试循环
    let lastErrorText = '';
    let lastResult: string | null = null;
    let hardRetryCount = 0;
    const MAX_HARD_RETRIES = 2;

    while (hardRetryCount <= MAX_HARD_RETRIES) {
      const currentMessages = [...canvasChatMessages, userMessage];
      const apiMessages = currentMessages.map(m => ({ role: m.role, content: m.content }));

      // 找到最后一条 user message，嵌入上下文
      const lastUserIdx = apiMessages.map((m, i) => (m.role === 'user' ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
      if (lastUserIdx >= 0) {
        let userContent = `Current canvas state (JSON prompt):\n\`\`\`json\n${contextJson}\n\`\`\`\n\nMy composition request: ${apiMessages[lastUserIdx].content}`;
        // 若有 retry feedback 或循环中的错误，追加
        if (retryContext?.feedback) {
          userContent += `\n\n${buildLayoutFeedbackPrompt(retryContext.feedback)}`;
        } else if (lastErrorText) {
          userContent += `\n\n[Layout Feedback]\nThe previous JSON was invalid: ${lastErrorText}\nPlease return valid JSON inside a \`\`\`json code block.`;
        }
        apiMessages[lastUserIdx] = { role: 'user', content: userContent };
      }

      let langHint = '';
      if (chatResponseLang === 'en') langHint = '\nYou MUST respond in English.';
      else if (chatResponseLang === 'zh') langHint = '\n你必须用中文回复。';

      const result = await sendChatMessage(provider, parsed.modelName, apiMessages, CANVAS_CHAT_SYSTEM_PROMPT + langHint);

      if (!result.ok) {
        addCanvasChatMessage(createAssistantMessage(`Error: ${result.error || 'Unknown error'}`));
        setIsLoading(false);
        return;
      }

      const aiText = result.content || '';
      lastResult = aiText;
      const parsedJson = extractAndValidateIdeogramJSON(aiText);

      if (parsedJson !== null) {
        // 硬校验通过
        const assistantMessage = createAssistantMessage(aiText);
        addCanvasChatMessage(assistantMessage);
        setPendingIdeogramOutput(parsedJson);

        // → 接下来需要软校验，但软校验逻辑在 Task 6 — 目前直接 apply
        // （Task 6 会在此处插入软校验代码）
        setIsLoading(false);
        return;
      }

      // 硬校验失败：准备重试或结束
      hardRetryCount++;
      if (hardRetryCount <= MAX_HARD_RETRIES) {
        // 确定失败原因
        const match = aiText.match(/```json\s*([\s\S]*?)```/);
        if (!match) {
          lastErrorText = 'No ```json code block found in response.';
        } else {
          try {
            JSON.parse(match[1].trim());
            lastErrorText = 'JSON parsed but failed validation (missing required fields).';
          } catch (e) {
            lastErrorText = `JSON parse error: ${(e as Error).message}`;
          }
        }
        // 继续循环，下一次 user message 会包含 lastErrorText
        // 不追加 assistant message，避免消息列表膨胀
      } else {
        // 超过最大重试次数
        addCanvasChatMessage(createAssistantMessage(
          `Failed to generate valid JSON after ${MAX_HARD_RETRIES + 1} attempts.\nLast error: ${lastErrorText}`
        ));
        setIsLoading(false);
        return;
      }
    }
  } catch (err) {
    addCanvasChatMessage(createAssistantMessage(`Error: ${err instanceof Error ? err.message : String(err)}`));
  } finally {
    setIsLoading(false);
  }
}, [/* existing deps + retryContext? retryContext is param, not dep */]);
```

- [ ] **Step 3: Build and run existing tests**

Run: `npx vitest run src/hooks/__tests__/ src/services/__tests__/ src/store/__tests__/`
Expected: ALL PASS (integration tests for useCanvasChat may need updating if they exist)

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCanvasChat.ts
git commit -m "feat: add hard retry logic in useCanvasChat for JSON parse failures"
```

---

### Task 5: LayoutQualityDialog Component

**Files:**
- Create: `src/components/canvas/LayoutQualityDialog.tsx`

**Interfaces:**
- Consumes: `LayoutQualityReport`, `pendingQualityReport` (from store), `useI18n()`, `onAccept`, `onRegenerate` callbacks
- Produces: A non-blocking dialog component

- [ ] **Step 1: Write the component test**

```typescript
// src/components/canvas/__tests__/LayoutQualityDialog.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LayoutQualityDialog } from '../LayoutQualityDialog';
import type { LayoutQualityReport } from '../../../services/layout-validator';

// Minimal mock for I18nProvider
vi.mock('../../../i18n/context', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

function makeReport(overrides: Partial<LayoutQualityReport> = {}): LayoutQualityReport {
  return {
    overallPass: false,
    metrics: [
      { field: 'coverage', passed: false, actual: 8, threshold: '15%-60%', message: 'Coverage too low' },
      { field: 'element_area', passed: true, actual: 0, threshold: '≥ 2%', message: 'All OK' },
    ],
    summaryText: '[Layout Feedback]\n- coverage: 8% (threshold: 15-60%)',
    userSummary: 'Coverage too low',
    ...overrides,
  };
}

describe('LayoutQualityDialog', () => {
  it('renders failed metrics', () => {
    const onAccept = vi.fn();
    const onRegenerate = vi.fn();
    render(
      <LayoutQualityDialog
        report={makeReport()}
        onAccept={onAccept}
        onRegenerate={onRegenerate}
      />
    );
    expect(screen.getByText(/coverage/i)).toBeDefined();
  });

  it('does not render when report is null', () => {
    const { container } = render(
      <LayoutQualityDialog
        report={null}
        onAccept={vi.fn()}
        onRegenerate={vi.fn()}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  it('calls onAccept when Accept button clicked', () => {
    const onAccept = vi.fn();
    render(
      <LayoutQualityDialog
        report={makeReport()}
        onAccept={onAccept}
        onRegenerate={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText(/layoutQuality\.accept|Accept/i));
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it('calls onRegenerate when Regenerate button clicked', () => {
    const onRegenerate = vi.fn();
    render(
      <LayoutQualityDialog
        report={makeReport()}
        onAccept={vi.fn()}
        onRegenerate={onRegenerate}
      />
    );
    fireEvent.click(screen.getByText(/regenerate|重新生成/i));
    expect(onRegenerate).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/canvas/__tests__/LayoutQualityDialog.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement LayoutQualityDialog**

```typescript
// src/components/canvas/LayoutQualityDialog.tsx
import type { LayoutQualityReport } from '../../services/layout-validator';
import { useI18n } from '../../i18n/context';

interface LayoutQualityDialogProps {
  report: LayoutQualityReport | null;
  onAccept: () => void;
  onRegenerate: () => void;
}

export function LayoutQualityDialog({ report, onAccept, onRegenerate }: LayoutQualityDialogProps) {
  const { t } = useI18n();

  if (!report || report.overallPass) return null;

  const failedMetrics = report.metrics.filter(m => !m.passed);

  return (
    <div className="layout-quality-dialog">
      <div className="layout-quality-dialog-content">
        <h3>{t('layoutQuality.title')}</h3>
        <div className="layout-quality-dialog-body">
          {failedMetrics.map(m => (
            <div key={m.field} className="layout-quality-metric">
              <span className="metric-label">
                {t(`layoutQuality.metric.${m.field}`)}
              </span>
              <span className="metric-value">{m.message}</span>
            </div>
          ))}
        </div>
        <div className="layout-quality-dialog-actions">
          <button className="btn btn-secondary" onClick={onAccept}>
            {t('layoutQuality.accept')}
          </button>
          <button className="btn btn-primary" onClick={onRegenerate}>
            {t('layoutQuality.regenerate')}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add CSS styles**

Read `src/index.css` and append styles for the dialog:

```css
/* Layout Quality Dialog */
.layout-quality-dialog {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 150;
  background: var(--surface-raised);
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 12px;
  padding: 16px;
  min-width: 320px;
  max-width: 420px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.layout-quality-dialog-content h3 {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--accent);
}

.layout-quality-dialog-body {
  margin-bottom: 16px;
}

.layout-quality-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border, #2a2a4a);
}

.layout-quality-metric:last-child {
  border-bottom: none;
}

.metric-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.metric-value {
  font-size: 13px;
  color: var(--text);
  line-height: 1.4;
}

.layout-quality-dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/canvas/__tests__/LayoutQualityDialog.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/canvas/LayoutQualityDialog.tsx src/components/canvas/__tests__/LayoutQualityDialog.test.tsx src/index.css
git commit -m "feat: add LayoutQualityDialog for soft validation user interaction"
```

---

### Task 6: Soft Validation Integration in useCanvasChat

**Files:**
- Modify: `src/hooks/useCanvasChat.ts`
- Modify: `src/components/canvas/CanvasArea.tsx` (or wherever chat panel renders the dialog)

**Interfaces:**
- Consumes: `validateLayout` (Task 1), `pendingQualityReport` store field (Task 2), `LayoutQualityDialog` (Task 5)
- Produces: Full validation flow connected

- [ ] **Step 1: Read current useCanvasChat.ts and CanvasArea.tsx**

Verify the exact lines for inserting soft validation after hard validation passes, and where to render LayoutQualityDialog.

- [ ] **Step 2: Add soft validation in sendMessage**

In `useCanvasChat.ts`, inside `sendMessage`, after hard validation passes (where `parsedJson !== null` and before `setIsLoading(false); return;`), insert:

```typescript
import { validateLayout } from '../services/layout-validator';

// Inside sendMessage, after setPendingIdeogramOutput(parsedJson):
// Soft validation
if (parsedJson.compositional_deconstruction.elements.length > 0) {
  const qualityReport = validateLayout(
    parsedJson.compositional_deconstruction.elements,
    parsedJson.canvasW ?? canvasW,
    parsedJson.canvasH ?? canvasH,
  );
  if (!qualityReport.overallPass) {
    setPendingQualityReport(qualityReport);
    setIsLoading(false);
    return; // 等待用户决定，不自动 apply
  }
}
// 软校验通过 → 自动 apply
setPendingQualityReport(null);
applyOutput(applySelections);
setPendingIdeogramOutput(null);
```

Also add `setPendingQualityReport` and `applySelections` to the hook's return value (they may already exist; verify).

- [ ] **Step 3: Add retry handler**

Add a `retryFromFeedback` function to the hook:

```typescript
const retryFromFeedback = useCallback(() => {
  const report = useEditorStore.getState().pendingQualityReport;
  if (!report) return;
  setPendingQualityReport(null);
  // 获取最后一条 user message
  const lastUserMsg = [...canvasChatMessages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) return;
  // 用 feedback 重试
  sendMessage(lastUserMsg.content, { feedback: report.summaryText });
}, [canvasChatMessages, sendMessage, setPendingQualityReport]);
```

Note: `sendMessage` is called inside a callback — this creates a closure issue since `sendMessage` is itself a `useCallback` that might not be defined yet. Best approach: use `useCallback` for `retryFromFeedback` after `sendMessage` is defined, or store the retry action in a ref.

Alternative simpler approach: expose a `handleRegenerate` function stored as a ref or pass the report summaryText directly. For implementation, the simplest path:

```typescript
// In the hook return, add:
handleRegenerate: () => {
  const report = useEditorStore.getState().pendingQualityReport;
  if (!report) return;
  setPendingQualityReport(null);
  // 取最后一条 user message 的内容（来自 canvasChatMessages）
  // 然后调 sendMessage（从 ref 或从 getState 获取最后一条 user 输入）
  const lastUserMsg = canvasChatMessages.filter(m => m.role === 'user').slice(-1)[0];
  if (!lastUserMsg) return;
  sendMessage(lastUserMsg.content, { feedback: report.summaryText });
}
```

- [ ] **Step 4: Render LayoutQualityDialog**

In `CanvasArea.tsx` (or wherever the chat dialog/popup renders), add:

```typescript
import { useEditorStore } from '../../store';
import { LayoutQualityDialog } from './LayoutQualityDialog';

// Inside the component:
const pendingQualityReport = useEditorStore(s => s.pendingQualityReport);
const setPendingQualityReport = useEditorStore(s => s.setPendingQualityReport);
const handleRegenerate = /* from useCanvasChat */;

return (
  <>
    {/* existing canvas content */}
    <LayoutQualityDialog
      report={pendingQualityReport}
      onAccept={() => {
        const store = useEditorStore.getState();
        store.applyOutput(store.applySelections);
        store.setPendingIdeogramOutput(null);
        store.setPendingQualityReport(null);
      }}
      onRegenerate={handleRegenerate}
    />
  </>
);
```

If `handleRegenerate` is not passed from the hook, get `sendMessage` from the hook instance. The cleanest approach: modify `useCanvasChat` to return `handleRegenerate` and consume it in the dialog.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useCanvasChat.ts src/components/canvas/CanvasArea.tsx
git commit -m "feat: integrate soft validation and LayoutQualityDialog into canvas chat flow"
```
