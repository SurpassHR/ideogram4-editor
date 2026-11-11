# Branch Model

- `main` — Electron desktop application and desktop release workflow.
- `gh-pages` — legacy Web migration bridge. This branch owns the GitHub Pages
  deployment workflow and builds with `npm run build:web`.

Do not publish desktop builds from this branch. Remove this branch after the
Web migration window ends.
