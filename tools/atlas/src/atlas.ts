// The atlas: what Novadeck is built of, as `extract/main.ts` reads it from the code and
// writes it to `src/generated/atlas.json`. The pages render only this.

// A place in the repository. `file` is repository-relative; `line` is 1-based, or null
// when a curated anchor's text no longer appears in the file (see `Atlas.broken`).
export type Anchor = { file: string; line: number | null }

// A curated pointer into the code: the file, and text that should appear in it. The
// extractor resolves it to the first line containing `text` (or line 1 without it).
export type AnchorRef = { file: string; text?: string }

export type JsonSchema = Record<string, unknown>

export type Atlas = {
  generatedAt: string
  commit: string
  // `https://github.com/<owner>/<repo>`, for linking anchors.
  repository: string
  // The absolute path of the checkout it was read from, for opening files in an editor.
  root: string
  runtime: Runtime
  areas: Area[]
  // How areas depend on each other, from imports, procedure calls and table queries.
  links: AreaLink[]
  api: Api
  data: Data
  agents: AgentSurface
  flows: Flow[]
  broken: BrokenAnchor[]
}

// What runs, and how the pieces talk.
export type Runtime = { nodes: RuntimeNode[]; edges: RuntimeEdge[] }

export type RuntimeNode = {
  id: string
  title: string
  kind: "process" | "binary" | "server" | "external"
  summary: string
  // Area ids that run inside this node.
  areas: string[]
  anchor: Anchor
  position: { x: number; y: number }
}

export type RuntimeEdge = {
  id: string
  from: string
  to: string
  // The channel, briefly: "oRPC over WebSocket", "Electron IPC", "MCP over stdio"…
  channel: string
  summary: string
  anchor: Anchor
}

// A slice of the code with one job: a package, a runner subsystem, a UI layer.
export type Area = {
  id: string
  title: string
  // The runtime node it runs in.
  node: string
  purpose: string
  globs: string[]
  files: number
  lines: number
  tests: number
  entries: Anchor[]
  docs: string[]
  // Ids of what this area owns, by where their code lives.
  procedures: string[]
  tables: string[]
  tools: string[]
}

export type AreaLink = {
  from: string
  to: string
  // "import": `from` imports code in `to`; "call": `from` calls a procedure `to` serves;
  // "data": `from` queries a table `to` owns.
  kind: "import" | "call" | "data"
  // How many imports, call sites or queries make up the link.
  weight: number
}

export type Api = { procedures: Procedure[]; errors: ApiError[] }

export type Procedure = {
  // Dotted path in the contract, e.g. "terminals.create".
  id: string
  namespace: string
  name: string
  kind: "call" | "stream"
  input: JsonSchema | null
  output: JsonSchema | null
  // The contract's line for this procedure.
  anchor: Anchor
  // The runner code that implements it.
  handler: Anchor | null
  // Error codes it can raise: the router's, and those thrown in its handler method. Helpers
  // deeper down may raise others.
  errors: string[]
  // UI (or other) code that calls it.
  callers: Anchor[]
  area: string | null
}

export type ApiError = { code: string; status: number; note: string | null }

export type Data = { tables: Table[]; settings: Setting[]; local: LocalKey[] }

export type Table = {
  name: string
  columns: Column[]
  sql: string
  anchor: Anchor
  // Code that queries the table, split by statement kind.
  readers: Anchor[]
  writers: Anchor[]
  area: string | null
}

export type Column = {
  name: string
  type: string
  constraints: string
  // The table a foreign key points at, from `REFERENCES t(...)`.
  references: string | null
}

export type Setting = {
  key: string
  // Which settings object it belongs to: "runner", "voice", "murmur"…
  group: string
  type: string
  anchor: Anchor
}

// Something the UI keeps in browser storage.
export type LocalKey = { key: string; summary: string | null; anchor: Anchor }

// Novadeck as an agent inside a terminal sees it.
export type AgentSurface = {
  tools: McpTool[]
  hooks: Hook[]
  contract: ContractMember[]
  harnesses: Harness[]
}

export type McpTool = {
  name: string
  description: string
  input: JsonSchema | null
  anchor: Anchor
  handler: Anchor | null
}

export type Hook = { harness: string; event: string; summary: string; anchor: Anchor }

// A member of the harness adapter contract in `harnesses/core`.
export type ContractMember = { name: string; optional: boolean; summary: string; anchor: Anchor }

export type Harness = {
  id: string
  title: string
  package: string
  // Contract member names this adapter provides.
  implements: string[]
  anchor: Anchor
}

// A traced path through the system, as a sequence of messages between runtime nodes.
export type Flow = {
  id: string
  title: string
  summary: string
  actors: string[]
  steps: FlowStep[]
}

export type FlowStep = {
  from: string
  to: string
  // Two to four words for the arrow; `text` is the full sentence, shown on demand.
  label: string
  text: string
  anchor: Anchor
}

export type BrokenAnchor = { where: string; file: string; text: string }
