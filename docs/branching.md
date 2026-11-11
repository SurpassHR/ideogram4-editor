# Branch Model

- `main` — Electron desktop application. Desktop packaging and release work
  targets this branch.
- `gh-pages` — legacy Web migration bridge. GitHub Pages deployment runs only
  from this branch and builds with `npm run build:web`.

Desktop releases do not deploy the Web site. Changes to the Web migration bridge
should be made on `gh-pages` until that branch is retired.
