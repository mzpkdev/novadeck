# NovaDeck

NovaDeck is a cross-platform desktop application built with Electron, React,
TypeScript, Vite, and Turborepo.

## Requirements

- Node.js 26
- pnpm 11.22.0

## Development

```sh
pnpm install
pnpm dev
```

The repository contains two workspace packages:

- `application` contains the Electron application and consumes the design system.
- `design-system` is an inner workspace containing `packages/css`, the complete framework-neutral
  CSS contract ported from Stardwst, and `packages/react`, the Ark UI React adapter. The React
  package owns a Storybook with the official themes addon and no browser-test harness.

Run the component workshop separately with:

```sh
pnpm storybook
```

The application itself is split into three trust boundaries:

- `application/src/main` owns the Electron lifecycle and native capabilities.
- `application/src/preload` exposes a narrow, typed API to the renderer.
- `application/src/renderer` contains the sandboxed React application.

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

- Linux x64: AppImage
- macOS universal: ZIP archive containing the application bundle
- Windows x64: portable executable

Artifacts are written to `application/release/`. Builds are intentionally unsigned for now,
so macOS Gatekeeper and Windows SmartScreen may warn when opening them. The
permanent application ID is `dev.mzpk.novadeck`. Before upload, the release
workflow launches every packaged application for ten seconds and fails if it
exits early.

## Releases

The latest unreleased state of `main` produces an immutable GitHub prerelease for
the dev channel. An active release always finishes. While it runs, GitHub keeps
only the newest pending release run, so several rapid merges can still be
combined into one release of the newest source. Release-it reads Conventional
Commits across that range to determine whether a release qualifies. Until
NovaDeck has an early working product, every qualifying release is explicitly
limited to a patch increment: `feat`, breaking changes, `fix`, `perf`, and
`build(deps)` all increment patch. Documentation, tests, CI, and other
maintenance commits do not qualify on their own. The release workflow contains
the single TODO that restores release-it's normal SemVer recommendation, where
`feat` increments minor and a breaking change increments major. Release-it uses
`v0.0.0` as the base when no release tag exists.

Release-it generates the notes, creates the `vX.Y.Z` tag, uploads the checksums
and native packages through a draft, then publishes the immutable prerelease.

To promote tested binaries without rebuilding them, open the prerelease on the
GitHub **Releases** page, choose **Edit**, clear **Set as a pre-release**, select
**Set as the latest release**, and update it. Immutable releases still allow
these two status changes; the tag and uploaded binaries remain locked.

Automatic publishing uses GitHub's built-in workflow token and requires no
long-lived repository secret. If an older run loses a race with a workflow-file
change, the newer `main` run becomes authoritative. Rerun the latest failed
workflow if no newer push superseded it. Release-it intentionally does not add
project-specific rollback logic. If an interrupted run leaves an unpublished
draft, delete it and its tag with
`gh release delete vX.Y.Z --cleanup-tag --yes`. If only the tag exists, delete it
with `git push origin --delete vX.Y.Z`, then rerun the latest workflow. Automatic
runs fail before calculating another version while the latest SemVer tag is
missing its published release or still has a draft.
