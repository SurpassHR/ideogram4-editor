# Task 3 Report: Color Limits + CJK Text Rejection

## Status
**All tasks completed successfully.** 42 tests passing (36 existing + 6 new).

## Commit
`c25f7ef` — `feat(validation): add color limit and CJK text validation`

## Modified Files
1. **`src/services/llm-canvas-chat.ts`** — `extractAndValidateIdeogramJSON` 新增 3 项验证
2. **`src/services/__tests__/llm-canvas-chat.test.ts`** — 新增 6 个测试用例

## Validation Rules Added

### A. Global `color_palette` ≤ 5 (post line 209)
- 访问 `obj.style_description.color_palette`
- 若为数组且长度 > 5，返回 `null`
- 先做 `typeof sd === 'object' && sd !== null` 类型守卫，避免 `style_description` 缺失时崩溃

### B. Per-element `color_palette` ≤ 5 (inside element loop)
- 若 `e.color_palette` 为数组且长度 > 5，返回 `null`
- `Array.isArray` 天然处理 `undefined`

### C. CJK text rejection (inside element loop)
- 仅当 `e.type === 'text'` 且 `typeof e.text === 'string'` 时检测
- 正则 `/[\u4e00-\u9fff]/` 匹配 CJK 统一汉字
- 匹配时返回 `null`；非 text 元素或无 text 字段自动跳过

## Edge Cases Handled
- `style_description` missing or null → skip global palette check (type guard)
- `color_palette` undefined → `Array.isArray` returns `false`, skipped
- `e.text` on non-text elements → CJK check guarded by `e.type === 'text'`
- `e.text` undefined/null on text elements → `typeof e.text === 'string'` guard

## Test Cases Added
| # | Description | Expected |
|---|---|---|
| 1 | global `color_palette` > 5 | `null` |
| 2 | global `color_palette` ≤ 5 | passes |
| 3 | per-element `color_palette` > 5 | `null` |
| 4 | type=text with CJK characters | `null` |
| 5 | type=text with English text | passes |
| 6 | type=obj with CJK in desc (not text field) | passes |

## Concerns
- `bbox` upper bound was already allowed beyond 1000 (pixel coordinates); no change needed.
- A future improvement could be to add a check that `text` field is present when `type === 'text'`, but it's out of scope for this task.
