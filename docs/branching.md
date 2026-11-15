# Branch Model

- `main` — Electron desktop application. Desktop packaging and release work
  targets this branch.
- `gh-pages` — legacy Web migration bridge. GitHub Pages deployment runs only
  from this branch and builds with `npm run build:web`.

Desktop releases do not deploy the Web site. Changes to the Web migration bridge
should be made on `gh-pages` until that branch is retired.

## Desktop releases

`.github/workflows/build-desktop.yml` builds macOS, Windows, and Linux packages.
Pushing a `v*` tag publishes the installers and SHA-256 checksums to GitHub
Releases. The tag must match `package.json` (`v<version>` or
`v<version>-<suffix>`); branch pushes only create workflow artifacts.
