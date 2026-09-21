# NovaDeck

NovaDeck is a React application with a Hono backend and an optional cross-platform
Electron host, built with TypeScript, Vite, and Turborepo.

## Requirements

- Node.js 26
- pnpm 11.22.0

## Development

```sh
pnpm install
pnpm dev
```

The repository contains four top-level workspace areas:

- `application/ui` is the standalone Vite and React frontend.
- `application/runtime` is the standalone Hono and Node.js backend. It exposes the API without
  owning frontend delivery.
- `application/host` is the Electron wrapper. It starts the runtime and loads the packaged UI for
  desktop users.
- `design-system` is an inner workspace containing `packages/css`, the complete framework-neutral
  CSS contract ported from Stardwst, and `packages/react`, the Ark UI React adapter. The React
  package owns a Storybook with the official themes addon and no browser-test harness.

The UI has no local stylesheets. It uses unstyled Ark UI React primitives, Lucide icons, and
Tailwind CSS utilities directly so its visuals can be iterated independently of the reusable
design-system packages.

Run the component workshop separately with:

```sh
pnpm storybook
```

Run the browser-hosted application without Electron with:

```sh
pnpm dev:web
```

The UI is then available at `http://127.0.0.1:5173` and calls the runtime directly.

## Deployment configuration

| Mode               | Configuration                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standalone UI      | `application/ui/.env` supplies the build-time `VITE_API_URL`; without it, the UI uses same-origin `/api`.                                                                                                     |
| Standalone runtime | `application/runtime/.env` supplies `HOST`, `PORT`, and the comma-separated `CORS_ORIGINS` allowlist.                                                                                                         |
| Electron           | The host starts the bundled runtime on `127.0.0.1` with an OS-selected port and desktop-only CORS, then provides the generated API URL through a sandboxed preload bridge. Package `.env` files are not used. |

Copy each package's environment template before changing standalone configuration:

```sh
cp application/ui/example.env application/ui/.env
cp application/runtime/example.env application/runtime/.env
```

For a static host such as GitHub Pages, set `VITE_API_URL` to the public HTTPS API URL before
building. The generated Content Security Policy permits that exact API origin. Add the static
frontend's origin to the runtime's `CORS_ORIGINS` when the packages are deployed separately. Local
`.env` files are ignored and must not be committed.

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

Artifacts are written to `application/host/release/`. Builds are intentionally unsigned for now,
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
