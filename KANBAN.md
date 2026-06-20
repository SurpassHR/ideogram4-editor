# Kanban 依赖链规则

Kanban 的 `auto-commit` 模式会将提交写入**任务自己的分支**，**不会自动合并回 `--base-ref` 指定的分支**。依赖链中下游任务启动时，`base-ref` 仍指向原始 commit，**不包含上游任务的任何改动**。这会导致：
- 下游任务被迫重新实现上游已完成的工作
- 多个任务对同一文件的修改产生不可调和的冲突
- 最终产物无法合并

## 默认行为

### 任务创建默认串行

多任务实施时，**默认创建串行依赖链**（`task link`），不允许并行。每个任务完成后自动启动下一个。

```bash
# 默认串行：task link 建立顺序依赖
task link --task-id <下游> --linked-task-id <上游>
```

### 默认启用 auto-review + auto-commit

所有任务创建时默认启用：
```bash
--auto-review-enabled true --auto-review-mode commit
```
任务完成后自动提交并移到 review/done，触发下游自动启动。

### 主 agent 判断是否需要 plan 模式

Kanban 侧栏 agent 根据任务复杂度决定是否启用 `--start-in-plan-mode true`：
- **简单任务**（明确的文件改动、单步实现）→ 不需要 plan
- **复杂任务**（多文件改动、架构决策、需要先调研）→ 启用 plan 模式，让 coding agent 先出计划再实施

### 必须基于分支创建任务

`--base-ref` 必须传**分支名**（如 `implementation-v2`），**禁止传 commit hash**。任务 worktree 基于分支创建，确保下游任务启动时能拿到上游 cherry-pick 的最新代码。

```bash
# ✓ 正确：基于分支
kanban task create --base-ref implementation-v2 ...

# ✗ 错误：基于 commit hash
kanban task create --base-ref 0b513d6 ...
```

## 依赖链规则

### 规则 1 — 优先用单任务避免拆分（首要原则）

对于强顺序依赖的工作（如 PR1→PR2→PR3 每个都改同一个文件），**优先合并为单个任务**，而非拆成依赖链。单任务在一个 worktree 内顺序执行，天然无跨 worktree 合并问题。仅当工作量过大（单 agent 上下文装不下）时才拆分。

### 规则 2 — 拆分后必须在任务间手动 cherry-pick

当任务 A 完成（auto-commit）后、任务 B 启动前，Kanban 管理 agent 必须：
1. 找到任务 A 的提交 hash（在 `~/.cline/worktrees/<taskA-id>/` 的 git log 中）
2. 在主仓库执行 `git cherry-pick <hash>` 将 A 的改动合入 base-ref
3. 确认 base-ref HEAD 已包含 A 的改动
4. 然后才允许下游任务 B 启动

### 规则 3 — 依赖链任务 prompt 必须说明上下文

每个下游任务的 prompt 中必须包含：
- 明确说明前置任务已完成并已 cherry-pick 到 base-ref
- 列出前置任务改动了哪些文件，避免重复实现
- 引用 spec/计划文档的对应章节，而非让任务自行推断范围

### 规则 4 — 验证 base-ref 包含预期提交再启动下游

启动下游任务前，执行 `git log --oneline <base-ref>` 确认：
- base-ref HEAD 包含上游任务的提交
- 无意外的分叉或缺失
