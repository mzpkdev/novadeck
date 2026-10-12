import type { AnchorRef, Area } from "../src/atlas.ts"

export type CuratedArea = Pick<Area, "id" | "title" | "node" | "purpose" | "globs" | "docs"> & {
  entries: AnchorRef[]
}

const runner = "application/runner/src"
const ui = "application/ui/src"

// The slices of the code worth knowing by name. Globs are repository-relative; where
// two overlap, the earlier area owns the file.
export const areas: CuratedArea[] = [
  {
    id: "runner-core",
    title: "Runner core",
    node: "runner",
    purpose:
      "Builds the runner from its parts and serves the protocol contract over a WebSocket, a port or HTTP, with token auth, the router that maps procedures to domain objects, and the CLI that starts it.",
    globs: [`${runner}/*.ts`],
    entries: [
      { file: `${runner}/runner.ts`, text: "export const createRunner" },
      { file: `${runner}/router.ts`, text: "export const createRouter" },
      { file: `${runner}/websocket.ts`, text: "export const serveWebSocket" },
    ],
    docs: ["docs/backend-api.md", "docs/backend-plan.md"],
  },
  {
    id: "runner-terminals",
    title: "Terminals",
    node: "runner",
    purpose:
      "Owns every terminal: spawns shells, keeps their screen, scrollback and transcripts, tracks the foreground process and its agent, handles prompts, answers, naming and nudges, and performs the calls agents make through the MCP server.",
    globs: [`${runner}/terminals/**`],
    entries: [
      { file: `${runner}/terminals/manager.ts`, text: "export class Terminals" },
      { file: `${runner}/terminals/opens.ts` },
      { file: `${runner}/terminals/doorbell.ts` },
    ],
    docs: ["docs/agent-workspace.md"],
  },
  {
    id: "runner-workspaces",
    title: "Workspaces and companions",
    node: "runner",
    purpose:
      "Projects and sessions with their SQLite store (settings, terminal order and layouts live there too), plus the companion items shown beside a terminal: files, pages, plans and their windows.",
    globs: [`${runner}/workspaces/**`, `${runner}/companions/**`],
    entries: [
      { file: `${runner}/workspaces/store.ts`, text: "CREATE TABLE projects" },
      { file: `${runner}/workspaces/projects.ts` },
      { file: `${runner}/companions/items.ts`, text: "export class CompanionItems" },
    ],
    docs: ["docs/agent-workspace.md"],
  },
  {
    id: "runner-messaging",
    title: "Agent messaging",
    node: "runner",
    purpose:
      "Lets agents in one project and session message each other: mailboxes with size and rate limits, leads and peers, held threads, and delivery through each harness's hooks and the terminal doorbell.",
    globs: [`${runner}/messaging/**`],
    entries: [
      { file: `${runner}/messaging/messaging.ts`, text: "export type Scope" },
      { file: `${runner}/messaging/mailbox.ts`, text: "export const maxMessageBytes" },
      { file: `${runner}/messaging/delivery.ts` },
    ],
    docs: ["docs/agent-messaging.md"],
  },
  {
    id: "runner-harnesses",
    title: "Harness service",
    node: "runner",
    purpose:
      "The runner's side of the agent harnesses: the registry of adapters, connecting and disconnecting their plugins, binding hook reports to sessions, and deriving activity, replies, plans and typed prompts from what they report.",
    globs: [`${runner}/harnesses/**`],
    entries: [
      { file: `${runner}/harnesses/registry.ts`, text: "export const harnesses" },
      { file: `${runner}/harnesses/service.ts`, text: "export const createHarnesses" },
      { file: `${runner}/harnesses/bindings.ts` },
    ],
    docs: ["docs/harness-adapters.md", "docs/harness-coverage.md"],
  },
  {
    id: "runner-shell",
    title: "Shell integration and MCP",
    node: "runner",
    purpose:
      "Writes the shell files and agent plugin files Novadeck puts in front of each terminal, receives hook reports from the relay, and serves the MCP tools agents call (show, send, open_terminal and the rest).",
    globs: [`${runner}/shell/**`],
    entries: [
      { file: `${runner}/shell/mcp.ts`, text: "const tools: readonly Tool<unknown>[]" },
      { file: `${runner}/shell/reports.ts`, text: "const callTypes" },
      { file: `${runner}/shell/install.ts` },
    ],
    docs: ["docs/agent-messaging.md"],
  },
  {
    id: "runner-engines",
    title: "Engine downloads",
    node: "runner",
    purpose:
      "Downloads, verifies, unpacks and tracks the native inference engines (voice and murmur) from their manifests, with progress and cancellation.",
    globs: [`${runner}/engines/**`],
    entries: [
      { file: `${runner}/engines/install.ts`, text: "export const fetchEngine" },
      { file: `${runner}/engines/download.ts` },
    ],
    docs: [],
  },
  {
    id: "runner-voice",
    title: "Voice input",
    node: "runner",
    purpose:
      "Voice dictation: language and model catalog, the whisper engine process, audio clips converted to WAV, and the settings and state the UI reads.",
    globs: [`${runner}/voice/**`],
    entries: [
      { file: `${runner}/voice/service.ts`, text: "export class Voice" },
      { file: `${runner}/voice/engine.ts` },
    ],
    docs: [],
  },
  {
    id: "runner-murmur",
    title: "Murmur",
    node: "runner",
    purpose:
      "The optional small local model that names and summarizes terminals: runs the llama.cpp server, builds redacted digests of a terminal's activity, and keeps the descriptions stable.",
    globs: [`${runner}/murmur/**`],
    entries: [
      { file: `${runner}/murmur/service.ts`, text: "export class Murmur" },
      { file: `${runner}/murmur/describer.ts`, text: "export type Digest" },
      { file: `${runner}/murmur/redact.test.ts` },
    ],
    docs: ["docs/murmur.md"],
  },
  {
    id: "runner-testing",
    title: "Runner e2e and fixtures",
    node: "runner",
    purpose:
      "End-to-end scenarios that drive real harness CLIs and a runner, and the shared test doubles the runner's unit tests use.",
    globs: [`${runner}/e2e/**`, `${runner}/testing/**`, `${runner}/test.ts`],
    entries: [{ file: `${runner}/e2e/scenarios.ts` }, { file: `${runner}/test.ts` }],
    docs: ["docs/e2e-testing.md"],
  },
  {
    id: "protocol",
    title: "Protocol",
    node: "runner",
    purpose:
      "The contract between UI and runner: the oRPC procedure contract with Zod schemas and error codes, the wire format and transports, the Electron bridge types, and the connectRunner client.",
    globs: ["application/protocol/**"],
    entries: [
      { file: "application/protocol/src/contract.ts", text: "export const contract" },
      { file: "application/protocol/src/client.ts" },
      { file: "application/protocol/src/harnesses.ts", text: "export const harnesses" },
    ],
    docs: ["docs/backend-api.md"],
  },
  {
    id: "relay",
    title: "Relay",
    node: "relay",
    purpose:
      "A small Rust binary agents start for Novadeck: it runs hooks and the status line by forwarding what they know to the runner and printing its answer, and carries the MCP server's JSON-RPC to the terminal's runner.",
    globs: ["application/relay/**"],
    entries: [
      { file: "application/relay/src/main.rs" },
      { file: "application/relay/src/hook.rs" },
      { file: "application/relay/src/mcp.rs", text: "pub fn run" },
    ],
    docs: ["docs/agent-messaging.md"],
  },
  {
    id: "harness-core",
    title: "Harness contract",
    node: "runner",
    purpose:
      "The contract every harness adapter implements, and what they share: hook commands, events, reports, dialogs, input box profiles and shell-quoting helpers.",
    globs: ["harnesses/core/**"],
    entries: [
      { file: "harnesses/core/src/harness.ts", text: "export type Harness = {" },
      { file: "harnesses/core/src/events.ts" },
    ],
    docs: ["docs/harness-adapters.md"],
  },
  {
    id: "harness-adapters",
    title: "Harness adapters",
    node: "runner",
    purpose:
      "One adapter each for Claude Code, Codex and Antigravity: how to install their plugin and hooks, decode hook reports, read transcripts, read their dialogs and input box, and start or resume a session.",
    globs: ["harnesses/claude/**", "harnesses/codex/**", "harnesses/agy/**"],
    entries: [
      { file: "harnesses/claude/src/index.ts", text: "export const claude" },
      { file: "harnesses/codex/src/index.ts", text: "export const codex" },
      { file: "harnesses/agy/src/index.ts", text: "export const agy" },
    ],
    docs: ["docs/harness-adapters.md", "docs/harness-coverage.md"],
  },
  {
    id: "host-main",
    title: "Electron host",
    node: "electron-main",
    purpose:
      "The desktop app's main process: windows and menus, starting the runner in a utility process, permissions and sandbox choices, installation, auto-update and quitting.",
    globs: [
      "application/host/src/main/**",
      "application/host/src/runner/**",
      "application/host/*",
      "application/host/scripts/**",
      "application/host/src/*.ts",
    ],
    entries: [
      { file: "application/host/src/main/index.ts", text: "const createWindow" },
      { file: "application/host/src/main/updater.ts" },
      { file: "application/host/src/runner/index.ts" },
    ],
    docs: ["docs/auto-update.md", "docs/release-signing.md"],
  },
  {
    id: "host-preload",
    title: "Preload bridge",
    node: "preload",
    purpose:
      "The narrow, validated API the packaged renderer gets from the host: the runner's URL and token, and the desktop actions it may request.",
    globs: ["application/host/src/preload/**"],
    entries: [{ file: "application/host/src/preload/index.ts" }],
    docs: [],
  },
  {
    id: "ui-app",
    title: "UI app shell and commands",
    node: "renderer",
    purpose:
      "The composition root: boot and backend selection, routing, the UI store, selectors, the commands and key commands over the stores, and the controller hooks that sync React with them.",
    globs: [
      `${ui}/app/**`,
      `${ui}/*.ts`,
      `${ui}/*.tsx`,
      "application/ui/index.html",
      "application/ui/*.ts",
    ],
    entries: [
      { file: `${ui}/app/App.tsx`, text: "export const App" },
      { file: `${ui}/app/commands/context.ts`, text: "export type CommandContext" },
      { file: `${ui}/app/controller/useWorkspaceEffects.ts` },
    ],
    docs: [],
  },
  {
    id: "ui-model",
    title: "UI model",
    node: "renderer",
    purpose:
      "The pure domain of the workspace: state, reducer and store, seed data, layout rules, roster, conversations, messages, companions and usage, with no React.",
    globs: [`${ui}/model/**`],
    entries: [
      { file: `${ui}/model/store.ts`, text: "export const createStore" },
      { file: `${ui}/model/types.ts` },
      { file: `${ui}/model/roster.ts` },
    ],
    docs: [],
  },
  {
    id: "ui-runner-adapter",
    title: "UI runner adapter",
    node: "renderer",
    purpose:
      "The backend port implemented against the runner: connection and reconnects, seeding from the runner, saves, conversations, companions, messages and the xterm terminal surface.",
    globs: [`${ui}/backend/runner/**`],
    entries: [
      { file: `${ui}/backend/runner/backend.ts`, text: "export type RunnerBackendOptions" },
      { file: `${ui}/backend/runner/RunnerTerminal.tsx` },
    ],
    docs: ["docs/backend-api.md"],
  },
  {
    id: "ui-backend",
    title: "UI backend port and demo",
    node: "renderer",
    purpose:
      "The port the UI talks to its backend through, the shared terminal lifecycle registry, and the demo adapter with sample data that tests and specs run on.",
    globs: [`${ui}/backend/**`],
    entries: [
      { file: `${ui}/backend/port.ts`, text: "export type TerminalSurfaceProps" },
      { file: `${ui}/backend/registry.ts` },
      { file: `${ui}/backend/demo/index.ts`, text: "export const createDemoBackend" },
    ],
    docs: [],
  },
  {
    id: "ui-terminals",
    title: "UI terminals and layouts",
    node: "renderer",
    purpose:
      "Terminal frames and tabs, the companion taskbar and panes, the agent chat, and the Focus, Grid and Canvas views that arrange them.",
    globs: [`${ui}/terminals/**`, `${ui}/layouts/**`],
    entries: [{ file: `${ui}/terminals/drag-session.ts` }, { file: `${ui}/layouts/transition.ts` }],
    docs: [],
  },
  {
    id: "ui-shell",
    title: "UI shell and features",
    node: "renderer",
    purpose:
      "The chrome around the workspace and its feature panels: header, rail, sidebar, notifications, projects, preferences, search and voice dictation.",
    globs: [
      `${ui}/shell/**`,
      `${ui}/sidebar/**`,
      `${ui}/notifications/**`,
      `${ui}/projects/**`,
      `${ui}/preferences/**`,
      `${ui}/search/**`,
      `${ui}/voice/**`,
    ],
    entries: [
      { file: `${ui}/shell/shell-state.ts` },
      { file: `${ui}/notifications/notifications.ts` },
      { file: `${ui}/voice/dictation.ts` },
    ],
    docs: [],
  },
  {
    id: "ui-design-system",
    title: "UI toolkit, theme and specs",
    node: "renderer",
    purpose:
      "Reusable controls and recipes, themes (Graphite, Phosphor), shortcut and focus contracts, styles, and the behaviour specs and fixtures that exercise the whole UI.",
    globs: [
      `${ui}/ui-toolkit/**`,
      `${ui}/theme/**`,
      `${ui}/interaction/**`,
      `${ui}/assets/**`,
      `${ui}/styles.css`,
      `${ui}/specs/**`,
      `${ui}/test/**`,
    ],
    entries: [{ file: `${ui}/theme/apply.ts` }, { file: `${ui}/interaction/keymap.ts` }],
    docs: ["docs/theming.md"],
  },
  {
    id: "engine-whisper",
    title: "Whisper engine",
    node: "whisper",
    purpose:
      "Builds whisper.cpp into the downloadable voice engine and its engine.json, using the shared ggml build, with the patches Novadeck applies.",
    globs: ["engines/whisper/**", "engines/ggml-build/**"],
    entries: [
      { file: "engines/whisper/index.js", text: "export const engineManifest" },
      { file: "engines/ggml-build/index.ts", text: "export const buildEngine" },
    ],
    docs: [],
  },
  {
    id: "engine-murmur",
    title: "Murmur engine",
    node: "murmur",
    purpose:
      "Builds llama.cpp into the downloadable murmur engine and its engine.json, with the patches Novadeck applies.",
    globs: ["engines/murmur/**"],
    entries: [{ file: "engines/murmur/index.js", text: "export const engineManifest" }],
    docs: ["docs/murmur.md"],
  },
]
