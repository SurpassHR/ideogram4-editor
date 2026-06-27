> 本项目详细说明见 `AGENTS.md`。以下是 Claude Code 专用规则。

## 项目身份
- Ideogram JSON Prompt 可视化编辑器（React 19 + Zustand 5 + Vite 7 + Tailwind CSS v4）
- 画布拖拽创建边界框 → 配置描述/颜色 → 生成标准 JSON prompt → ComfyUI API 生成图片
- 零外部 UI 组件库，纯自定义 CSS

## 关键红线
- **不要直接 import 来自 `src/components/ui/icons.tsx` 以外的图标源**（禁止 emoji/Unicode/字体图标）
- **改前端后必须用 Playwright 验证页面正常渲染**
- **commit 前必须通过 `npm run test` + `npm run build`**
- **颜色调色板每个边界框最多 16 色**（已从 5 提升至 16）
- **不要修改 src/ 来适配部署**——hash 路由无需 404.html
- **Pages Source 必须设为 GitHub Actions**（非分支）

## 项目约定速查
| 项 | 值 |
|----|-----|
| 状态管理 | `useEditorStore`（Zustand 单一 store） |
| i18n | `I18nProvider` + `useI18n()` hook，`t('section.key')` |
| 图标 | `src/components/ui/icons.tsx` 中 `IconXxx` 组件 |
| 部署 base | `process.env.GITHUB_ACTIONS ? '/ideogram4-editor/' : '/'` |
| 域名 | `gp.hrfuqiang.top/ideogram4-editor/` |
| 键盘快捷键 | Ctrl+Z/Y undo/redo, Ctrl+D/X/C/V box ops, Delete 删除 |

## 常用命令
- `npm run dev` — 开发服务器
- `npm run test` — 测试
- `npm run build` — 生产构建（含 tsc -b）
- `npx tsc -b` — 类型检查

## 深入文档
- [AGENTS.md](./AGENTS.md) — 完整项目说明、架构、工作流规则
- [README.zh.md](./README.zh.md) — 中文用户文档
- [docs/deployment.md](./docs/deployment.md) — 部署指南
- [KANBAN.md](./KANBAN.md) — Kanban 依赖链规则
