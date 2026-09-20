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

## Releases

Every release-worthy squash commit on `main` produces an immutable GitHub
prerelease for the dev channel. Conventional Commits calculate its normal
SemVer version: `fix` and `perf` increment patch, `feat` increments minor, and a
breaking change increments major. `build(deps)` increments patch; documentation,
tests, CI, and other maintenance commits do not release.

During beta, the repository variable `RELEASE_PATCH_ONLY` is `true`, so every
release-worthy commit advances only the patch component. Set it to `false` when
normal minor and major bumps should begin; the qualification rules do not change.
The configured `package.json` version remains the initial release when no tag
exists, so beta starts at `v0.0.0`.

To promote tested binaries without rebuilding them, open **Actions → Release**,
run the workflow with the `promote` operation, and enter its `vX.Y.Z` prerelease
tag. Promotion verifies every platform package and checksum, then marks that
same GitHub Release as the latest stable release. A manual `package` operation
builds temporary artifacts without creating a release.

Automatic releases and stable promotions use durable GitHub Actions queues, so
bursts of merges and promotions wait instead of cancelling in-progress work.
Manual package builds use independent concurrency groups and can run in
parallel. If a release fails, rerun it before merging another release-worthy
change; the next successful automatic run otherwise calculates one version from
everything since the last published tag.
