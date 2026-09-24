# NovaDeck

A terminal workspace for organizing projects, sessions, and parallel work.

Focus on one terminal, arrange several in a grid, or spread them across a zoomable
canvas. Keep related work together and switch between sessions from the sidebar.

In Canvas, scroll to zoom in or out, and drag the background or an inactive terminal
to pan. Click a terminal to activate it, then select its text, scroll its output,
or drag its header to move it.
Double-click or double-tap a terminal header to smoothly center and zoom that terminal
to fit the canvas viewport. Repeat the gesture on the same terminal to return to the
previous camera position and zoom. Manual pan or zoom (including keyboard shortcuts),
Fit all, sidebar camera navigation, leaving Canvas, or switching sessions clears that
return point. Flying to a different terminal starts a new visit from the current camera.
Repeated double gestures during a flight are ignored. Minimized terminals restore first;
returning the camera does not minimize them again. The header's arrow opens Focus view.

Click **New terminal** or use its keyboard shortcut to create and select a terminal
immediately in any view, with or without Zen. Focus shows it right away. Grid uses
an available slot and scrolls it into view. Canvas chooses a nearby free position,
preferring the current viewport, and pans only as needed to reveal it without changing
zoom. Terminals can be moved or resized immediately; there is no placement step.

Use the terminal header's resize control to alternate between two sizes. In Canvas,
**Enlarge terminal** sets 1200×800 and **Make compact** sets 600×400, independent of zoom,
viewport size, or aspect ratio. Canvas grows or shrinks around the terminal's center
without changing the camera. In Grid, **Make full width** fills the available columns
and **Make compact** uses half of them (at least four columns), preserving terminal height.
On four-column screens both widths are the same. Resizing restores minimized terminals.
Preset choices are remembered per terminal, session, and view. New terminals start
compact: 600×400 in Canvas and compact column width in Grid, with no placement preview.

In Grid, selecting a terminal from its tab smoothly scrolls it into view. With
reduced motion enabled, it scrolls immediately.

Use the eye on a terminal tab to hide it from Grid and Canvas without closing it.
Hidden tabs stay in the list with a faded label. While selected, a hidden terminal
appears at 50% opacity in Grid and Canvas, then disappears when it is no longer active.
Its hidden setting stays unchanged; use the eye to make it visible permanently.
Hidden terminals retain
their content and layout and remain available in Focus view.
Showing and hiding use a short fade and scale transition; reduced motion skips it.
Switching terminal tabs in Focus uses the same transition.

## Zen mode

Choose **Enter Zen mode** in the top bar to hide the header, sidebar, rail, and footer
without leaving the current Focus, Grid, or Canvas view. The floating dock provides
New terminal, enabled view choices, and Exit Zen. At rest it folds to New terminal and a
small chevron. Click or tap the chevron to toggle the remaining controls, or activate
it with Enter or Space. Clicking outside, leaving with keyboard focus, or pressing Escape folds it again.
Canvas navigation uses gestures and
keyboard shortcuts: +/− to zoom and 0 to fit all terminals.
Focus becomes an edge-to-edge terminal, while Grid and Canvas gain the available space.
In Focus, click the terminal title to switch between terminals in the current session;
the list marks the active terminal and shows process status. This also works outside Zen.
Terminal names stay visible; header actions appear on hover or keyboard focus on desktop
and stay visible on touch devices. Search and terminal shortcuts remain available.

Zen preserves the active terminal and Canvas camera on entry. Exit Zen restores the
previous sidebar visibility and panel. Explicit sidebar shortcuts or Browse sessions
leave Zen to show the requested panel. Zen is temporary and resets on reload.

## Keyboard shortcuts

| Action                                            | macOS            | Windows and Linux  |
| ------------------------------------------------- | ---------------- | ------------------ |
| Find a terminal                                   | `Cmd+K`          | `Ctrl+Shift+K`     |
| Recent terminals                                  | `Ctrl+Tab`       | `Ctrl+Tab`         |
| Cycle backward through recent terminals           | `Ctrl+Shift+Tab` | `Ctrl+Shift+Tab`   |
| Toggle Focus and the previous Grid or Canvas view | `Cmd+Enter`      | `Ctrl+Shift+Enter` |
| New terminal                                      | `Cmd+T`          | `Ctrl+Shift+T`     |
| New session in the current project                | `Cmd+Shift+N`    | `Ctrl+Shift+N`     |
| Toggle terminal sidebar                           | `Cmd+Shift+1`    | `Ctrl+Shift+1`     |
| Toggle session sidebar                            | `Cmd+Shift+2`    | `Ctrl+Shift+2`     |
| Open preferences                                  | `Cmd+,`          | `Ctrl+,`           |

The new-session shortcut creates and selects an empty session in the current project
and opens the Sessions sidebar.

Sidebar shortcuts open or switch to their panel; pressing the same shortcut again hides it.

Hold Ctrl while pressing Tab to choose a terminal, then release Ctrl to switch.
Up and Down select terminals in sidebar order in Focus, Grid, and Canvas, wrapping
at either end. Selection pans Canvas or scrolls Grid just like clicking a tab.
Left and Right cycle through enabled views in Focus → Grid → Canvas order, wrapping
at either end and retaining the selected terminal.
Escape first deselects the active terminal in any view, then hides the open sidebar
on the next press. Further presses do nothing. Focus keeps the displayed terminal
in place; clicking it activates it again. Dialogs and renaming handle
Escape before workspace selection.
Text inputs and open dialogs retain their own arrow behavior. Arrow keys no longer
pan the canvas camera. While the recent switcher is open, Up and Down cycle its list.
The new-terminal shortcut creates a terminal immediately and opens the desktop Terminals sidebar
when outside Zen. On narrow screens the sidebar stays closed so the new terminal is visible. In Focus, it also focuses the command input. These shortcuts are available in the desktop app; browsers may
reserve `Ctrl+Tab` for changing browser tabs. The Shortcuts tab in Preferences
shows the bindings for the current platform.

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
