# NovaDeck

A terminal workspace for organizing projects, sessions, and parallel work.

Focus on one terminal, arrange several in a grid, or spread them across a zoomable
canvas. Keep related work together and switch between sessions from the sidebar.

In Canvas, drag or scroll over an inactive terminal to pan the canvas. Click to
activate it, then select its text, scroll its output, or drag its header to move it.

## Development

Requires Node.js 26 and pnpm 11.22.0. Run commands from the repository root.

```sh
pnpm install
pnpm dev
```

`pnpm dev` launches the Electron desktop application. To run the UI and runtime
in a browser instead:

```sh
pnpm dev:web
```

Open <http://127.0.0.1:5173>. For UI-only work, use
`pnpm --filter @novadeck/ui dev`.

## Repository map

This is a TypeScript monorepo using pnpm workspaces and Turborepo.

| Package               | Responsibility                                                   |
| --------------------- | ---------------------------------------------------------------- |
| `application/ui`      | React frontend built with Vite, Tailwind CSS, and Lucide icons.  |
| `application/runtime` | Hono API running on Node.js, independent of frontend delivery.   |
| `application/host`    | Electron host that starts the runtime and loads the packaged UI. |
| `scripts`             | Repository checks and automation.                                |

The terminal interface currently uses sample output and in-memory commands, not
real shell processes or model calls. Projects, sessions, and layouts reset on
reload; preferences and sidebar settings are stored locally. Keep this boundary
in mind when changing terminal behavior or adding runtime integration.

### Working on the UI

Source lives in `application/ui/src/`:

| Location                                                               | What belongs here                                                       |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `app/`                                                                 | App composition, browser effects, and integration tests.                |
| `ui-toolkit/`                                                          | Reusable styled controls and direct Ark UI imports.                     |
| `workspace/model/`                                                     | Shared types, the pure workspace reducer, selectors, and tests.         |
| `workspace/terminals/`                                                 | Terminal cards and sortable tabs.                                       |
| `workspace/layouts/`                                                   | Grid and Canvas views, layout logic, and view transitions.              |
| `workspace/sidebar/`, `projects/`, `preferences/`, `search/`, `shell/` | Feature components, navigation, and app chrome, all under `workspace/`. |
| `workspace/mock/`                                                      | Sample projects, transcripts, and command replies.                      |
| `styles.css`                                                           | Theme tokens, global primitives, and specialized library/canvas styles. |

Navigation uses React Router with hash URLs in both the browser and Electron,
so links work with the packaged `file://` UI and static hosting. For example:

```text
#/projects/storefront/sessions/initial/canvas?terminal=05&panel=sessions
```

The path selects a project, workspace session, and view. Query parameters select
the terminal, sidebar panel, and dialog (`dialog=search` or `dialog=preferences`);
Preferences also accepts `section=shortcuts`. Back and Forward restore navigation
without discarding terminal drafts or output. Sidebar visibility, search text,
canvas gestures, and other temporary controls stay local.

Sample sessions use the stable ID `initial`. New sessions still live only in
memory: reloading an expired session link falls back to that project's available
session. Unknown routes, missing terminals, and disabled views are replaced with
a valid URL. Routing does not persist terminal data across reloads.

Keep project and session data in the workspace reducer; the URL owns the current
navigation, while the reducer remembers each session's last selection. Address updates by
project and session IDs so delayed callbacks affect the session that created
them. XYFlow owns live Canvas gestures; save geometry and camera state when a
gesture ends or the view unmounts.

Keep direct Ark UI imports in `ui-toolkit/`; features own their content and state.
Use Tailwind utilities for ordinary component styling and colocate tests with
the feature they cover. See [CODING.md](CODING.md) for broader conventions.

## Configuration

For standalone UI/runtime configuration, copy the environment templates:

```sh
cp application/ui/example.env application/ui/.env
cp application/runtime/example.env application/runtime/.env
```

- UI: `VITE_API_URL` sets the API URL at build time; the default is same-origin `/api`.
- Runtime: `HOST`, `PORT`, and `CORS_ORIGINS` control the listener and allowed frontend origins.
- Electron: the host starts the bundled runtime on a local, OS-selected port and
  supplies its URL through a sandboxed preload bridge. Package `.env` files are not used.

For a separately hosted frontend, set `VITE_API_URL` to the public HTTPS API URL
before building and add the frontend origin to `CORS_ORIGINS`. The generated
Content Security Policy permits the configured API origin. Local `.env` files
are ignored; never commit credentials.

## Validation

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Use package filters for focused checks, for example `pnpm --filter @novadeck/ui test`.
Tests use Vitest, React Testing Library for renderer interactions, and MSW for
HTTP behavior. The PR workflows run formatting, lint, typechecking, tests,
builds, and PR metadata checks on Linux. PRs marked ready for review package
and smoke-test the app on Linux, macOS, and Windows using the same workflow as
releases. Draft PRs skip packaging; PR checks never create tags or publish releases.
Quality checks run on PR opening, reopening, and commits. Marking a draft PR ready
starts only the Release workflow, which reuses the matching Quality result before
packaging and smoke testing. Release preparation, tagging, and publishing are
disabled for PR runs.

## Packaging and releases

```sh
pnpm package:linux
pnpm package:mac
pnpm package:win
```

Artifacts go to `application/host/release/`: a Linux x64 AppImage, a macOS
universal ZIP, or a Windows x64 portable executable. Builds are unsigned, so
Gatekeeper or SmartScreen may warn. The application ID is `dev.mzpk.novadeck`.

The [release workflow](.github/workflows/release.yml) publishes immutable GitHub
prereleases from qualifying changes on `main`, with notes, checksums, and native
packages. It smoke-tests each packaged application before upload. Conventional
Commits determine release eligibility; versions are currently limited to patch
increments. Documentation-only changes do not trigger a release. See
[.release-it.json](.release-it.json) for the release configuration.

Promote tested binaries on GitHub Releases by clearing **Set as a pre-release**
and selecting **Set as the latest release**; no rebuild is needed. For an
interrupted release, inspect the latest workflow first. An unpublished draft or
orphaned version tag must be cleaned up before rerunning the latest release
workflow; published immutable releases must remain intact.

## Contributing

Start with [AGENTS.md](AGENTS.md) for the required reading,
[CONTRIBUTING.md](CONTRIBUTING.md) for the issue and PR workflow, and
[CODING.md](CODING.md) for code and test conventions. Follow
[SECURITY.md](SECURITY.md) for credentials and vulnerability reports.
