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

The latest unreleased state of `main` produces an immutable GitHub prerelease for
the dev channel. Rapid pushes cancel older release builds, so several merges can
be combined into one release of the newest source. Conventional Commits across
that range calculate its normal SemVer version: `fix` and `perf` increment patch,
`feat` increments minor, and a breaking change increments major. `build(deps)`
increments patch; documentation, tests, CI, and other maintenance commits do not
qualify on their own.

During beta, the repository variable `RELEASE_PATCH_ONLY` is `true`, so every
release containing qualifying changes advances only the patch component. Set it
to `false` when normal minor and major bumps should begin; the qualification
rules do not change. The configured `package.json` version remains the initial
release when no tag exists, so beta starts at `v0.0.0`.

To promote tested binaries without rebuilding them, open the prerelease on the
GitHub **Releases** page, choose **Edit**, clear **Set as a pre-release**, select
**Set as the latest release**, and update it. Immutable releases still allow
these two status changes; the tag and uploaded binaries remain locked.

A manual **Actions → Release → Run workflow** packages the selected source
without creating a GitHub Release. Untagged manual builds use
`<latest-version>-manual.<run-number>` so their filenames and application
metadata identify them as non-release builds.

Automatic publishing uses GitHub's built-in workflow token and requires no
long-lived repository secret. If an older run loses a race with a workflow-file
change, the newer `main` run becomes authoritative. Rerun the latest failed
workflow if no newer push superseded it. If an interrupted run leaves an
unpublished draft and tag behind, run
`gh release delete vX.Y.Z --cleanup-tag --yes` before rerunning the latest
workflow.
