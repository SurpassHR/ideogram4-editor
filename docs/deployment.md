# GitHub Pages 部署指南

> 最后更新：2026-06-21

## 部署架构

```
自定义域名 gp.hrfuqiang.top
       │
       ▼
用户站点 SurpassHR.github.io (CNAME → gp.hrfuqiang.top)
       │
       ├── /ideogram4-editor/  →  SurpassHR/ideogram4-editor (artifact-based)
       └── /fund-manager/      →  SurpassHR/fund-manager   (artifact-based)
```

- 自定义域名 `gp.hrfuqiang.top` 绑定在用户站点仓库 `SurpassHR.github.io` 上
- 所有项目页面通过 `https://gp.hrfuqiang.top/<repo-name>/` 访问
- 每个项目仓库独立部署，通过 GitHub Actions workflow 构建和发布

## 快速部署

### 前提条件

1. 仓库已推送到 GitHub
2. GitHub Pages Source 设为 **GitHub Actions**（Settings → Pages → Source）
3. 自定义域名已在用户站点仓库配置好

### 步骤

1. 在 `vite.config.ts` 中设置动态 `base`：
   ```ts
   base: process.env.GITHUB_ACTIONS ? '/<repo-name>/' : '/',
   ```
2. 创建 `.github/workflows/deploy.yml`（见下方模板）
3. push 到 `main` 分支，Actions 自动部署

## Workflow 模板

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: ['main']
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: lts/*
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v5
        with:
          path: ./dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

## 已知问题与避坑

### 1. 自定义域名只能绑定一个仓库

**症状：** 设置域名时提示 "already taken by another repository"

**根因：** GitHub 每个账号一个自定义域名只能绑定到一个仓库

**解决：** 创建 `<username>.github.io` 用户站点仓库，将域名绑定到用户站点。所有项目页面自动通过 `https://custom.domain/<repo>/` 访问。

### 2. 不要用 API 删除 Pages 配置

**症状：** 删除 Pages 配置后用 API 重建（`POST /repos/{owner}/{repo}/pages`），workflow 的 `deploy-pages` 报告成功但内容始终 404

**根因：** API 重建的 Pages 配置处于 `status: null` 的空转状态，无法正常服务

**解决：** 在 GitHub UI（Settings → Pages → Source: GitHub Actions）中重新配置，不要用 API。

### 3. action 版本必须保持更新

**症状：** `actions/deploy-pages@v4` 在 Node 24 运行环境下有兼容性问题

**解决：** 使用最新版本：
- `actions/checkout@v6`
- `actions/setup-node@v6`
- `actions/upload-pages-artifact@v5`
- `actions/deploy-pages@v5`

### 4. `base: './'` 有已知 Vite bug

**症状：** CSS `url()` 引用和深层 import 的模块路径解析错误

**解决：** 使用绝对路径 `'/<repo>/'`，不在生产构建中使用相对路径

### 5. 项目构建输出目录要匹配上传路径

**症状：** 如果 Vite `outDir` 为 `dist/<repo>`，则 `upload-pages-artifact` 的 `path` 必须为 `dist/<repo>`（而非 `dist`）

## 本仓库配置

| 项 | 值 |
|---|---|
| 仓库 | `SurpassHR/ideogram4-editor` |
| base | `/ideogram4-editor/`（CI 中 `GITHUB_ACTIONS=true` 时激活） |
| CNAME | `public/CNAME` → `gp.hrfuqiang.top` |
| homepage | `https://gp.hrfuqiang.top/ideogram4-editor/` |
| Workflow | `.github/workflows/deploy.yml` |
| Pages URL | `https://gp.hrfuqiang.top/ideogram4-editor/` |
