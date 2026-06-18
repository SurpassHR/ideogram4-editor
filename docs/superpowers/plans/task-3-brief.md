# Task 3 Brief: 新增验证 — 颜色数量上限 + Chinese 文本拒绝

**目标**: 在 `extractAndValidateIdeogramJSON` 中新增 3 项验证规则 + 新增 6 个测试用例

**目标文件**:
1. `src/services/llm-canvas-chat.ts:177-230` — `extractAndValidateIdeogramJSON` 函数
2. `src/services/__tests__/llm-canvas-chat.test.ts` — 新增测试用例

## 修改 A: extractAndValidateIdeogramJSON 验证增强

### A1. 全局 color_palette 上限检查 (在现有验证后添加)

在 `const cdObj = cd as Record<string, unknown>;`（约 line 205）之后，检查 `cdObj.background` 和 `sdObj.color_palette`：

```typescript
  // ✅ 新增: global color_palette ≤ 5
  // style_description 在 top level obj 中: obj.style_description.color_palette
  const sd = obj.style_description;
  if (typeof sd === 'object' && sd !== null) {
    const sdObj = sd as Record<string, unknown>;
    const globalPalette = sdObj.color_palette;
    if (Array.isArray(globalPalette) && globalPalette.length > 5) return null;
  }
```

> 注意: 位置放在现有验证逻辑中，`compositional_deconstruction` 检查之后（或风格对应的字段中）。需要访问 `obj.style_description.color_palette` 并检查长度 ≤ 5。

### A2. Per-element color_palette 上限检查 (在 element 循环中添加)

在 `for (const el of elements)` 循环中（约 line 210），在现有 `desc` 检查之后（line 226 之后）追加：

```typescript
    // ✅ 新增: per-element color_palette ≤ 5
    if (Array.isArray(e.color_palette) && e.color_palette.length > 5) return null;
```

### A3. Chinese 文本检测 (在 element 循环中添加)

在 A2 检查之后追加：

```typescript
    // ✅ 新增: type=text 且 text 含 CJK 字符 → 拒绝
    if (e.type === 'text' && typeof e.text === 'string') {
      // CJK统一汉字 Unicode 范围: \u4e00-\u9fff
      const cjkRegex = /[\u4e00-\u9fff]/;
      if (cjkRegex.test(e.text)) return null;
    }
```

## 修改 B: 新增测试用例

在 `src/services/__tests__/llm-canvas-chat.test.ts` 中，在现有 `describe('extractAndValidateIdeogramJSON')` 区块末尾（约 line 378 之前）插入以下新测试用例：

### B1. 全局调色板 > 5 色应返回 null
```typescript
  it('global color_palette > 5 should return null', () => {
    const tooManyColors = {
      ...validOutput,
      style_description: {
        ...validOutput.style_description,
        color_palette: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(tooManyColors));
    expect(result).toBeNull();
  });
```

### B2. 全局调色板 ≤ 5 色应通过
```typescript
  it('global color_palette <= 5 should pass', () => {
    const fineColors = {
      ...validOutput,
      style_description: {
        ...validOutput.style_description,
        color_palette: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(fineColors));
    expect(result).not.toBeNull();
  });
```

### B3. 单元素 color_palette > 5 应返回 null
```typescript
  it('per-element color_palette > 5 should return null', () => {
    const tooManyElementColors = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          {
            type: 'obj',
            bbox: [100, 200, 500, 800],
            desc: 'An object with too many colors',
            color_palette: ['#A1', '#A2', '#A3', '#A4', '#A5', '#A6'],
          },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(tooManyElementColors));
    expect(result).toBeNull();
  });
```

### B4. type=text 含中文字符应返回 null
```typescript
  it('type=text with CJK characters should return null', () => {
    const cjkText = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          {
            type: 'text',
            bbox: [100, 200, 300, 800],
            desc: 'Title text',
            text: '蝙蝠侠大战钢铁侠',  // 中文 → 应拒绝
          },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(cjkText));
    expect(result).toBeNull();
  });
```

### B5. type=text 含纯英文应通过
```typescript
  it('type=text with English text should pass', () => {
    const englishText = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          {
            type: 'text',
            bbox: [100, 200, 300, 800],
            desc: 'Title text at top center',
            text: 'BATMAN VS IRON MAN',
          },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(englishText));
    expect(result).not.toBeNull();
  });
```

### B6. type=obj 的 desc 含中文应通过（仅 text 字段受限）
```typescript
  it('type=obj with CJK in desc should pass (only text field is restricted)', () => {
    const cjkDesc = {
      ...validOutput,
      compositional_deconstruction: {
        ...validOutput.compositional_deconstruction,
        elements: [
          {
            type: 'obj',
            bbox: [100, 200, 500, 800],
            desc: '一棵大树 with detailed bark texture',  // 中文 desc 允许
          },
        ],
      },
    };
    const result = extractAndValidateIdeogramJSON(wrap(cjkDesc));
    expect(result).not.toBeNull();
  });
```

## 验证

```bash
cd /media/hr/Data/Codes/ideogram4-editor && npx vitest run src/services/__tests__/llm-canvas-chat.test.ts 2>&1
```

All 36+6 = 42 tests must pass.

## 约束
- 不改动 JSON Schema 注释
- 不改动 system prompt 内容
- 不改动 store 或 UI
