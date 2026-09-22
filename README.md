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

The repository contains three application workspace packages:

- `application/ui` is the standalone Vite and React frontend. It contains an interactive monochrome
  terminal mockup with focus, draggable grid, and zoomable canvas layouts. Tailwind CSS and Lucide
  provide styling and icons directly in this package.
- `application/runtime` is the standalone Hono and Node.js backend. It exposes the API without
  owning frontend delivery.
- `application/host` is the Electron wrapper. It starts the runtime and loads the packaged UI for
  desktop users.

Run the browser-hosted application without Electron with:

```sh
pnpm dev:web
```

The UI is then available at `http://127.0.0.1:5173`. To iterate on the mockup without the
runtime, use `pnpm --filter @novadeck/ui dev`.

Grid view uses React Grid Layout: drag terminal headers to rearrange panels and drag the
bottom-right grip to resize. Panels snap to a responsive grid and fill vertical gaps. Each
screen size retains its arrangement when switching views during the current app session.

The terminal sessions and output are sample content. Checkout implementation (`claude`) and Checkout review (`codex`)
terminals show distinct AI TUI-style transcripts with prompts, tool activity, and sample results.
Their message inputs retain local demo commands and acknowledge other prompts without calling a model. Local demo commands (`help`, `pwd`, `ls`,
`whoami`, `date`, `echo`, and `clear`) update in-memory history; they do not execute a shell.
Switch layouts with the header controls. Sidebar tabs show each terminal’s name and command; use the
pencil to rename a terminal (Enter saves, Escape cancels) and the × to close it.
Both sidebar lists use a shared `SidebarItem`: matching two-line rows, a leading icon, a quiet
secondary line, and a white bordered selection with a thin left marker. Terminal names use the
full first line; process details and the individually fading rename/close controls share the
second. Session rows show their date and terminal/running counts, with terminal names in the
tooltip. Both create actions sit directly below the shared sidebar header.
Sidebar tabs use [dnd-kit](https://dndkit.com/react/hooks/use-sortable/) for reordering: drag the
name area, or hold briefly before dragging on touch. With a tab focused, Space picks it up,
arrow keys move it, Space drops it, and Escape cancels; Enter still selects the terminal.
Tab order is shared across views and retained per mock workspace for the current app session.
Reordering leaves Grid/Canvas geometry, the active terminal, and command drafts intact.
In Grid and Canvas, unfocused terminals fade to 50% opacity, brighten to 75% on hover, and
return to full opacity when focused, using the shared state transition.
Grid shows all terminals at full opacity when no terminal is selected.

The header workspace switcher starts on `storefront`, with `api-service` as another sample project.
Its dropdown shows directory paths and a disabled Open folder… action, reserved for Electron's
native directory picker. Workspace names will come from the selected directory; there is no
name-entry form or simulated folder browser.
The Sessions icon in the left rail opens each project's ongoing sessions. New session adds an
empty session while keeping all previous terminals available; click a session to return to it.
Sessions use automatic date/time names. Each retains terminal names,
tab order, selection, submitted output, unsent drafts, scroll positions, the selected view, and
Grid/Canvas layouts and camera. Switching to another project retains its own session list and
last active session. The same Sessions toggle is available in the left rail on mobile. Starting fresh and
switching sessions do not close terminals or change their process state; process activity remains
sample data in this frontend mockup, with no real shell processes connected.
These are in-memory demo workspaces; no filesystem directories are read or created.

All three desktop views use Allotment for the sidebar split. Drag the divider to resize
between 180–400px; its width is shared across views and saved locally. Double-click to reset
to 228px. Keyboard users can focus the divider and use arrow keys (Shift for larger steps),
Home/End for the limits, or Enter to reset. The narrow left rail has separate Terminals and Sessions
toggles: clicking the active one hides it, and opening the other switches panels. Both panels have
an × close button that returns keyboard focus to their toggle. A shared `SidebarPanel` component
owns the heading, count, close control, content spacing, and panel transition for both. Desktop opening/closing uses a
180ms width transition, preserving the sidebar width and mounted terminals; switching panels uses
a short fade/slide. Divider resizing stays immediate, and reduced motion disables transitions.
The collapsed desktop preference is saved across reloads. On mobile, the same rail controls an
animated drawer, with a fading backdrop that also dismisses it.
In Grid, selecting a sidebar tab highlights and scrolls to its terminal.

The canvas uses [XYFlow / React Flow](https://reactflow.dev/) custom terminal nodes. Select a
sidebar session to center it, drag the background to pan, and drag a terminal header to move it.
Canvas nodes move and resize freely, then ease onto the 24px grid when released, matching the dot
spacing and Grid’s vertical step. Arrow keys move a selected node by 24px (Shift for larger steps).
XYFlow owns live node geometry and camera movement; the workspace stores the final position, size,
and viewport when a gesture ends, or when leaving Canvas during a gesture. Panning does not rerender
the app or terminal content; zoom still updates header scaling.
Drag the bottom-right grip to resize, or use the minus/plus header control to fold and restore a
terminal. Collapsed terminals keep their resize grip for width-only changes and retain their expanded height.
Headers and resize grips scale more gently than the terminal body. Clicking the
background unfocuses the terminal; hovering over its content lets you scroll without focusing it.
Closing the active Canvas terminal clears selection without panning or zooming to a neighbor.
Zoom with the controls, a two-finger pinch, or Ctrl/Cmd + wheel, including over terminal cards.
Use the fit button to see all terminals. A focused canvas also supports arrow keys, `+`/`-`,
and `0` to fit. Choosing Grid or Canvas saves your preferred windowed mode across reloads
(Grid by default). The fullscreen terminal's windowed button is available whenever a windowed mode is enabled and names its
destination: “Open in Grid” or “Open in Canvas”. Search results stay in the current view for
both clicks and Enter, including Focus entered from navigation or a terminal’s maximize button. Grid scrolls to the selected terminal; Canvas pans and zooms to fit the
searched terminal with a small margin. Canvas sidebar selection and fullscreen return preserve the current zoom.
Top navigation uses a quick 140ms fade with a small slide following the tab direction; the header
and sidebar stay still.
The terminal expand and return buttons animate the card between layouts over 230ms, with a
separate content crossfade and stationary app chrome. Reduced motion and unsupported browsers
switch immediately; offscreen terminals fade instead of flying across the workspace.
Double-click or double-tap a terminal header to enter Focus, or return to the last windowed mode.
Header buttons, dragging, and disabled view modes retain their existing behavior.
Canvas positions, sizes, folded states, zoom, and pan survive ordinary mode switches. Windowed
and search actions explicitly reveal their target; Canvas sidebar selection also centers its
terminal without changing zoom. Cmd/Ctrl + K opens session
search, and Cmd/Ctrl + comma opens preferences. The header keeps an icon-only search button on narrow screens. Search and Preferences share a 140ms movement and 120ms fade on open and dismissal;
reduced motion makes both immediate. Preferences has General and Shortcuts tabs sharing the taller panel’s height, with a subtle content fade. Short viewports scroll the content while retaining the heading and tabs. Clicking the backdrop dismisses Preferences and restores focus to its opener.
General contains terminal text size and View modes toggles, applied immediately and saved locally.
Disable unused Focus, Grid, or Canvas modes to hide their navigation and actions; at least one mode
must remain enabled. Disabling the active mode switches to an enabled view. Search and windowed
actions use an available mode, and disabled layouts are retained until the page reloads.
Theme and terminal text size use Ark UI Select dropdowns, rendered inside the modal’s focus boundary with keyboard navigation and focus restoration.
General also shows the hardcoded Monochrome theme and an appearance switch locked to Light; dark mode is not available.
Shortcuts lists the existing search and preferences keyboard controls.
Reloading resets the mock workspaces, sessions, and layouts, while sidebar width, collapsed state, and the preferred windowed mode remain saved.

App chrome shares the sidebar’s restrained styling: centered view navigation, white terminal
headers with a thin active marker, bordered command inputs, and matching search, preferences,
and workspace controls. Empty workspaces retain the gradient and dot background. Borders and
surface tones separate panels, with subtle shared shadows beneath terminal cards, floating controls, menus, and dialogs. Selected sidebar tabs, view controls, and bordered buttons use the lightest shadow token; compact layouts keep navigation accessible.

Tailwind v4 tokens live in `application/ui/src/styles.css` using the
[CSS theme configuration](https://tailwindcss.com/docs/theme), with the existing
`@tailwindcss/vite` plugin in `application/ui/vite.config.ts`. Colors, fonts, panel radius,
and shadows are centralized there. Ordinary component styling uses Tailwind utility classes in JSX;
`styles.css` retains the theme, shared primitives, contextual terminal/library rules, and canvas
effects, while `workspace/shell/ModalMotion.css` owns Search and Preferences presence animations. Shared motion tokens give controls 120ms feedback and selection
states 180ms fades; dragging stays immediate and reduced motion disables these transitions.
The UI's state model lives in `application/ui/src/workspace/model/types.ts`, with pure updates and
selectors in `workspace/model/state.ts`. One reducer owns the project/session tree: each project retains
its active session and history, and each session owns its terminals, drafts, output, selection,
view choice, and layouts. Updates carry project and session IDs so delayed component callbacks
still update their original session. Closing a terminal prunes its output and layout records.

`app/App.tsx` composes the views and coordinates browser effects, navigation, and transient controls.
`WorkspaceHeader` renders navigation, `TerminalSearch` owns search queries and result actions, and the
sidebar, terminal, Grid, and Canvas components handle their respective presentation and interactions.
`workspace/preferences/preferences.ts` reads and validates persisted preferences. Sample projects, terminals,
command replies, and transcripts live under `workspace/mock/`; they are separate from the state model.
The source folders follow UI features and ownership:

| Folder (under `src/`)    | Responsibility                                               |
| ------------------------ | ------------------------------------------------------------ |
| `ui-toolkit/`            | Reusable styled controls; owns direct Ark UI imports         |
| `app/`                   | Application composition and integration tests                |
| `workspace/model/`       | Workspace types, pure reducer, selectors, and reducer tests  |
| `workspace/terminals/`   | Terminal cards and sortable terminal tabs                    |
| `workspace/layouts/`     | Grid/Canvas views, background effects, and view transitions  |
| `workspace/sidebar/`     | Shared sidebar presentation and saved-session list           |
| `workspace/projects/`    | Project selection and the future native folder entry point   |
| `workspace/preferences/` | Preferences UI and stored preference validation              |
| `workspace/search/`      | Terminal search and its input/focus lifecycle                |
| `workspace/shell/`       | Header, pane layout, and shared modal motion                 |
| `workspace/mock/`        | Sample projects, terminals, command replies, and transcripts |

`ui-toolkit/` isolates Ark UI behind React props: Dialog, Popover, Tabs, Select,
SearchCombobox, Editable, SegmentGroup, ToggleGroup, and Tooltip. Features own their
content, workspace state, and layout; toolkit controls own keyboard interaction, focus,
and overlay dismissal. Keep direct Ark UI imports inside the toolkit. Select accepts an
optional `portalContainer` to keep its popup within a modal’s focus boundary.

Search and Preferences share Dialog; the mobile sidebar uses it as a drawer with its
own toggle rail and trapped focus. Search uses Combobox for Arrow/Home/End navigation and
Enter selection, defaulting to the first match when none is highlighted. Workspace selection
uses Popover, preference sections use Tabs, and terminal renaming uses Editable. The view
selector is a SegmentGroup, sidebar toggles form a deselectable ToggleGroup, and icon controls
use Tooltip. Native form controls and the existing Allotment, dnd-kit, Grid, and Canvas
libraries retain their specialized responsibilities.

Keep tests beside their feature, import directly from the owning module, and avoid barrel files
or extra domain/repository/service layers until a concrete integration needs them.

Reducer tests cover session isolation, restoration, scoped updates, and terminal cleanup, alongside
the App interaction tests. This remains an in-memory mockup; runtime/process integration and
workspace persistence are future work.

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
