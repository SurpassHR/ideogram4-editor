# Task 1 Brief: 优化系统提示词

**目标**: 修改 `CANVAS_CHAT_SYSTEM_PROMPT` 常量在 `src/services/llm-canvas-chat.ts` — 纯文本修改，5 个具体改动。

**目标行**: `src/services/llm-canvas-chat.ts:14-100`

## 改动清单

### 1. 全局调色板上限 (line 29)

**旧**: `"color_palette": string[],   // max 16 global colors, 6-char hex uppercase (e.g., "#FF5733")`

**新**: `"color_palette": string[],   // max 5 global colors, 6-char hex uppercase (e.g., "#FF5733")`

### 2. Element color_palette 上限 (line 42)

**旧**: `"color_palette": string[]   // optional, max 5 colors per element, 6-char hex uppercase`

**新**: `"color_palette": string[]   // optional, max 5 colors per element, 6-char hex uppercase (recommend 2-3)`

### 3. 新增 Design Principle — 英文文本 (after line 64, insert new bullet)

新增 Design Principle 条目在 `### Design Principles` 区块：

```
- Text language: If using type === "text", the text content MUST be in English — Ideogram renders English text most reliably. Do NOT use Chinese, Japanese, or other scripts for text regions
```

### 4. 新增 Design Principle — 空间一致性 (after new bullet above)

```
- Spatial consistency: Bounding box coordinates MUST match the position described in the element's desc field (e.g., if desc says "bottom left corner", bbox must be in the lower-left quadrant of the canvas)
```

### 5. 新增 Design Principle — 聚焦核心 (after "Spatial consistency")

```
- Focal coherence: Focus on 2-4 primary subject elements. Avoid adding minor tertiary elements (background crowds, small details) that fragment the viewer's attention. Fewer, larger elements produce stronger compositions
```

### 6. 修改 Design Principle — 简洁描述 (replace line 65 "Visual anchor" through line 67)

**旧** (3 lines):
```
- Visual anchor: at least one element should occupy ≥ 15% of canvas area as the primary focal point
- Breathing room: leave adequate whitespace between elements for visual clarity
- Size rhythm: vary element sizes with a max/min ratio ≤ 8:1 for visual interest
```

**新** (4 lines):
```
- Visual anchor: at least one element should occupy ≥ 15% of canvas area as the primary focal point
- Breathing room: leave adequate whitespace between elements for visual clarity
- Size rhythm: vary element sizes with a max/min ratio ≤ 8:1 for visual interest
- Concrete descriptions only: Use concrete visual descriptions (colors, shapes, textures, lighting, positions). Avoid abstract emotional language like "壮丽感", "majestic feeling", "dramatic tension" — describe only what is physically visible in the image
```

## 测试更新

**文件**: `src/services/__tests__/llm-canvas-chat.test.ts`

现有 `describe('CANVAS_CHAT_SYSTEM_PROMPT')` 区块（约 line 459-500）中有字符串断言检查 prompt 包含某些文本。

- 更新 "Numerical Layout Rules" 区块断言：如果断言了 "max 16"，改为 "max 5"
- 新增断言：检查 prompt 包含 "Text language"、"Spatial consistency"、"Focal coherence"、"Concrete descriptions"
- 新增断言：检查 prompt 不再包含 "max 16"（如果用 skip/regex）

注意：
- 不改动其他测试区块（`extractAndValidateIdeogramJSON`、`buildCanvasChatContext` 等）
- 不改动 `extractAndValidateIdeogramJSON` 函数本身
- 不改动 JSON Schema 部分

## 验证

```bash
cd /media/hr/Data/Codes/ideogram4-editor && npx vitest run src/services/__tests__/llm-canvas-chat.test.ts
```

所有测试必须通过。不运行全项目测试（其他文件未改动）。
