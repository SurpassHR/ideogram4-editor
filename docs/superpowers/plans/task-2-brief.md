# Task 2 Brief: 降低 Store 全局调色板上限

**目标**: 修改 `src/store/index.ts` 中 `addGlobalColor` 的最大值从 16 → 5

**具体改动**:
- Line 240: `if (state.globalPalette.length >= 16) return false;` → `if (state.globalPalette.length >= 5) return false;`

**不修改**:
- 不改动 per-box 调色板上限（保持 5）
- 不改动任何 UI 组件
- 不改动测试（现有 store 测试不测试具体阈值）

**验证**:
```bash
cd /media/hr/Data/Codes/ideogram4-editor && npx vitest run src/store/__tests__/index.test.ts 2>&1
```
