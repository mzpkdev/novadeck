# NovaDeck

NovaDeck is a cross-platform desktop application built with Electron, React,
TypeScript, and Vite.

## Requirements

- Node.js 26
- pnpm 11.22.0

## Development

```sh
pnpm install
pnpm dev
```

The application is split into three trust boundaries:

- `src/main` owns the Electron lifecycle and native capabilities.
- `src/preload` exposes a narrow, typed API to the renderer.
- `src/renderer` contains the sandboxed React application.

## Checks

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Renderer behavior is tested with Vitest and React Testing Library. HTTP-facing
code uses MSW so tests exercise `fetch` without replacing application modules.

## Packaging

```sh
pnpm package:linux
pnpm package:mac
pnpm package:win
```

The configured artifacts are:

- Linux x64: AppImage and DEB
- macOS universal: DMG and ZIP
- Windows x64: NSIS installer

Artifacts are written to `release/`. Builds are intentionally unsigned for now,
so macOS Gatekeeper and Windows SmartScreen may warn when opening them. The
permanent application ID is `dev.mzpk.novadeck`.
