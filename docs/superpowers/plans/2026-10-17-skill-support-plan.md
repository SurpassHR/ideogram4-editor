# Skill 能力接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让项目支持与 Agent Skill 兼容的 skill 包（`SKILL.md` + `references/`），内置 Ideogram 4 / FLUX 3 Klein / MOSS-Image 三个上游快照，并支持从 GitHub URL、本地文件夹、粘贴 Markdown 导入第三方 skill；Canvas Chat 按 skill 生成、校验、Apply 回画布，产出纳入 Gist 工作区备份。

**Architecture:** 新增 skill 类型/解析层（零依赖 frontmatter 解析）、adapter 层（`ideogram4` / `flux3-layout` / `moss-layout` / `none`，统一产出 0–1000 yxyx elements）、store 状态与一次性迁移、Skill 管理 UI 与 Canvas Chat 集成；内置 skill 文本以 `?raw` 内联，导入项存 localStorage。

**Tech Stack:** React 19 + TypeScript + Vite 7 + Zustand 5 + Vitest（与现有技术栈一致，不新增依赖）

**Spec:** 本文件即设计文档（用户已确认的 `proposed_plan`）

## Global Constraints

- 不新增运行时依赖；frontmatter / `agents/openai.yaml` 用手写 YAML 子集解析。
- 图标只能来自 `src/components/ui/icons.tsx`，禁止 emoji / Unicode 符号 / 字体图标；新增文案必须同时补中英 i18n。
- 不改 JSON 面板、ComfyUI workflow、Box Chat、输入框优化的行为。
- 内置 skill 文本为上游逐字节快照，来源 commit 记入 `THIRD_PARTY_NOTICES.md`。
- 提交前必须 `npm run test` + `npm run build` 全绿；前端改动后必须 Playwright 验证无白屏。

## Review Focus

- 导入的第三方 skill 体积超限或含二进制文件时的行为（应报错 / 跳过并告警，不得静默截断）。
- 未声明 adapter 的 skill 被误判为可 Apply（应降级 `none`，只展示与复制）。
- MOSS 编译的 floor/ceil 与中心原点换算（误差会直接导致生成图位置偏移）。
- 缺少 `skills` 字段的旧 Gist 备份仍可解析与恢复（不得因新模块报错）。
- 迁移重复执行（幂等）与 `activeSkillId` 指针失效（应回落到默认 skill）。

---

## 任务分解（串行，TDD）

- T1 类型 + 解析 + 内置快照 + NOTICE
- T2 adapter 框架 + ideogram4 adapter
- T3 flux3-layout adapter
- T4 moss-layout adapter + `moss-compile.ts`
- T5 store（skills/prefs/pendingApply）+ 一次性迁移
- T6 `SkillManagerPanel` + Settings SK 模块 + `SystemPromptPanel` 收敛为 box-only
- T7 Canvas Chat 集成（skill 下拉、prompt 组装、输出复制、Apply 走 `pendingApply`）
- T8 Gist 备份扩展（可选 `skills` 模块，向后兼容）
- T9 i18n / 图标 / 文档 + 全量验证（test + build + Playwright）

## 详细设计

详见用户确认的 `proposed_plan`（类型、adapter 契约、UI 交互、测试清单、假设与默认）。关键接口：

```ts
export type SkillAdapterId = 'ideogram4' | 'flux3-layout' | 'moss-layout' | 'none';
export interface SkillFile { path: string; content: string }
export interface SkillRecord {
  id: string; name: string; displayName: string; description: string;
  source: 'builtin' | 'imported';
  sourceUrl: string | null; license: string | null; version: string | null;
  adapter: SkillAdapterId; adapterConfirmed: boolean;
  files: SkillFile[]; createdAt: number; updatedAt: number;
}
export interface SkillPrefs {
  activeSkillId: string;
  overrides: Record<string, { adapter?: SkillAdapterId; enabledReferencePaths?: string[] }>;
}
```
