import { chmodSync, closeSync, mkdirSync, openSync, statSync } from "node:fs"
import { realpath, stat } from "node:fs/promises"
import { dirname, isAbsolute } from "node:path"
import { DatabaseSync, type SQLTagStore } from "node:sqlite"

import type { AgentName, Project, RunnerSettings, WorkspaceSession } from "@novadeck/protocol"

import { DomainError } from "../errors.js"
import type { Message, Thread, Work } from "../messaging/mailbox.js"
import type { HandleRecord, MailboxRecords } from "../messaging/records.js"
import type { ListedTerminal, SavedTerminal, TerminalRecords } from "../terminals/records.js"

/** Settings to change; those left out, or undefined, stay as they are. */
export type SettingsChange = {
  readonly [K in keyof RunnerSettings]?: RunnerSettings[K] | undefined
}

const schemaVersion = 1
const schema = `
  CREATE TABLE projects (
    position INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
    cwd TEXT NOT NULL CHECK(length(cwd) > 0)
  ) STRICT;
  CREATE TABLE sessions (
    position INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
    -- Opaque client state, such as a UI layout; null until the first save.
    state TEXT
  ) STRICT;
  CREATE INDEX sessions_project ON sessions(project_id, position);
`
// Tables added before the first release are created where missing instead of through
// a schema version: the app is unreleased, so nothing needs migrating.
const extras = `
  -- What restores a terminal after its shell is gone: kept as it changes, so a runner
  -- that is killed still leaves it behind.
  CREATE TABLE IF NOT EXISTS terminals (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    -- The shell's last reported directory.
    cwd TEXT NOT NULL,
    -- The latest session each agent reported, as JSON: { "claude": { sessionId, seq } }.
    agents TEXT NOT NULL,
    -- When the shell last showed its prompt, in epoch milliseconds.
    prompted_at REAL,
    -- The screen and scrollback, serialized; null when not kept.
    transcript TEXT,
    updated_at REAL NOT NULL,
    -- The title the person gave it, or its session's default.
    title TEXT,
    -- The handle of the terminal whose agent titled it; null when the person did.
    titled_by TEXT,
    -- The command it was opened to run at its first prompt.
    command TEXT,
    -- The program in its foreground when its shell was last seen.
    last_program TEXT,
    -- What its bound agent session worked on, for agents messaging each other, as JSON.
    work TEXT
  ) STRICT;
  -- The last default number given to a session's terminals ("Terminal 03").
  CREATE TABLE IF NOT EXISTS terminal_numbers (
    session_id TEXT PRIMARY KEY,
    last INTEGER NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;
  -- Agent messaging (docs/agent-messaging.md). Each terminal's handle in its project,
  -- such as codex-2, kept while its messages are; removed_at says since when neither the
  -- terminal nor its saved record exists.
  CREATE TABLE IF NOT EXISTS handles (
    terminal_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    handle TEXT NOT NULL,
    removed_at REAL,
    UNIQUE (project_id, handle)
  ) STRICT;
  -- The last number given to each prefix in each project, so no handle is used twice.
  CREATE TABLE IF NOT EXISTS handle_counters (
    project_id TEXT NOT NULL,
    prefix TEXT NOT NULL,
    last INTEGER NOT NULL,
    PRIMARY KEY (project_id, prefix)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS message_threads (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    -- Its two terminals, in the order its first message went.
    first_terminal TEXT NOT NULL,
    second_terminal TEXT NOT NULL,
    hops INTEGER NOT NULL,
    -- How many it may deliver before the person releases it again.
    allowed INTEGER NOT NULL,
    last_at REAL NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    hop INTEGER NOT NULL,
    from_terminal TEXT NOT NULL,
    from_handle TEXT NOT NULL,
    from_agent TEXT,
    from_session TEXT,
    to_terminal TEXT NOT NULL,
    to_handle TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    to_session TEXT NOT NULL,
    text TEXT NOT NULL,
    sent_at REAL NOT NULL,
    state TEXT NOT NULL,
    delivered_at REAL,
    -- Whether its sender was told it is gone.
    notified INTEGER NOT NULL
  ) STRICT;
`
// Columns `extras` added to its tables since they were first created.
const added = [
  ["terminals", "title"],
  ["terminals", "titled_by"],
  ["terminals", "command"],
  ["terminals", "last_program"],
  ["terminals", "work"],
] as const

const prepareFile = (path: string): void => {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  try {
    closeSync(openSync(path, "wx", 0o600))
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
      throw error
    }
  }
  const file = statSync(path)
  if (process.platform !== "win32" && file.uid === process.getuid?.()) {
    chmodSync(path, 0o600)
  }
}

/** Creates the schema in a new database and refuses one written by a newer runner. */
const prepareSchema = (database: DatabaseSync): void => {
  database.exec("BEGIN IMMEDIATE")
  try {
    const version = database.prepare("PRAGMA user_version").get()?.user_version
    if (typeof version !== "number" || version > schemaVersion) {
      throw new Error("The workspace database schema is newer than this runner supports")
    }
    if (version === 0) database.exec(`${schema} PRAGMA user_version = ${schemaVersion};`)
    database.exec(extras)
    // Columns added to a table that already exists, as in a database from before them.
    for (const [table, column] of added) {
      const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
      if (!columns.some(({ name }) => name === column))
        database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`)
    }
    database.exec("COMMIT")
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}

type TerminalRow = {
  id: string
  session_id: string
  cwd: string
  agents: string
  prompted_at: number | null
  transcript: string | null
  updated_at: number
  title: string | null
  titled_by: string | null
  command: string | null
  last_program: string | null
}

const listed = (row: Omit<TerminalRow, "transcript">) => ({
  id: row.id,
  sessionId: row.session_id,
  title: row.title,
  titledBy: row.titled_by,
  command: row.command,
  lastProgram: row.last_program,
  cwd: row.cwd,
  agents: agentsOf(row.agents),
  promptedAt: row.prompted_at,
  savedAt: row.updated_at,
})

const agentsOf = (text: string): SavedTerminal["agents"] => {
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === "object" && value !== null ? (value as SavedTerminal["agents"]) : {}
  } catch {
    return {}
  }
}

type MessageRow = {
  id: string
  project_id: string
  thread_id: string
  hop: number
  from_terminal: string
  from_handle: string
  from_agent: string | null
  from_session: string | null
  to_terminal: string
  to_handle: string
  to_agent: string
  to_session: string
  text: string
  sent_at: number
  state: string
  delivered_at: number | null
  notified: number
}

type ThreadRow = {
  id: string
  project_id: string
  first_terminal: string
  second_terminal: string
  hops: number
  allowed: number
  last_at: number
}

const messageOf = (row: MessageRow): Message => ({
  id: row.id,
  projectId: row.project_id,
  thread: row.thread_id,
  hop: row.hop,
  from: {
    terminalId: row.from_terminal,
    handle: row.from_handle,
    agent: row.from_agent as Message["from"]["agent"],
    sessionId: row.from_session,
  },
  to: {
    terminalId: row.to_terminal,
    handle: row.to_handle,
    agent: row.to_agent as Message["to"]["agent"],
    sessionId: row.to_session,
  },
  text: row.text,
  sentAt: row.sent_at,
  state: row.state as Message["state"],
  deliveredAt: row.delivered_at,
  notified: row.notified === 1,
})

export class WorkspaceStore implements TerminalRecords, MailboxRecords {
  private readonly database: DatabaseSync
  private readonly queries: SQLTagStore
  private lastSave = 0

  constructor(path = ":memory:") {
    if (path !== ":memory:") prepareFile(path)
    this.database = new DatabaseSync(path, {
      enableForeignKeyConstraints: true,
      timeout: 5_000,
    })
    try {
      prepareSchema(this.database)
    } catch (error) {
      this.database.close()
      throw error
    }
    // Transcripts may hold secrets: what is deleted is overwritten, not left in free pages.
    this.database.exec("PRAGMA secure_delete = ON")
    this.queries = this.database.createTagStore(48)
  }

  projects(): Project[] {
    return this.queries.all`SELECT id, name, cwd FROM projects ORDER BY position` as Project[]
  }

  /** Creates a project in an existing directory; a taken `id` is a `CONFLICT`. */
  async createProject(input: Project): Promise<Project> {
    if (!isAbsolute(input.cwd)) {
      throw new DomainError("INVALID_DIRECTORY", "Project directories must be absolute")
    }
    let cwd: string
    try {
      cwd = await realpath(input.cwd)
      if (!(await stat(cwd)).isDirectory()) throw new Error("Not a directory")
    } catch {
      throw new DomainError("INVALID_DIRECTORY", "Project directory does not exist")
    }
    const project = { id: input.id, name: input.name, cwd }
    if (this.queries.get`SELECT 1 FROM projects WHERE id = ${project.id}`) {
      throw new DomainError("CONFLICT", "Project id is already taken")
    }
    void this.queries
      .run`INSERT INTO projects (id, name, cwd) VALUES (${project.id}, ${project.name}, ${project.cwd})`
    return project
  }

  renameProject(input: { projectId: string; name: string }): Project {
    this.project(input.projectId)
    void this.queries.run`UPDATE projects SET name = ${input.name} WHERE id = ${input.projectId}`
    return this.project(input.projectId)
  }

  project(projectId: string): Project {
    const project = this.queries.get`SELECT id, name, cwd FROM projects WHERE id = ${projectId}` as
      | Project
      | undefined
    if (!project) throw new DomainError("NOT_FOUND", "Project not found")
    return project
  }

  sessions(projectId: string): WorkspaceSession[] {
    this.project(projectId)
    return this.queries.all`
      SELECT id, project_id AS projectId, name, state FROM sessions
      WHERE project_id = ${projectId} ORDER BY position
    ` as WorkspaceSession[]
  }

  /** Creates a session in an existing project; a taken `id` is a `CONFLICT`. */
  createSession(input: { id: string; projectId: string; name: string }): WorkspaceSession {
    this.project(input.projectId)
    const session = { ...input, state: null }
    if (this.queries.get`SELECT 1 FROM sessions WHERE id = ${session.id}`) {
      throw new DomainError("CONFLICT", "Session id is already taken")
    }
    void this.queries
      .run`INSERT INTO sessions (id, project_id, name) VALUES (${session.id}, ${session.projectId}, ${session.name})`
    return session
  }

  renameSession(input: { sessionId: string; name: string }): WorkspaceSession {
    this.session(input.sessionId)
    void this.queries.run`UPDATE sessions SET name = ${input.name} WHERE id = ${input.sessionId}`
    return this.session(input.sessionId)
  }

  /** Replaces the session's client state without interpreting it. */
  saveSession(input: { sessionId: string; state: string }): void {
    this.session(input.sessionId)
    void this.queries.run`UPDATE sessions SET state = ${input.state} WHERE id = ${input.sessionId}`
  }

  session(sessionId: string): WorkspaceSession {
    const session = this.queries.get`
      SELECT id, project_id AS projectId, name, state FROM sessions WHERE id = ${sessionId}
    ` as WorkspaceSession | undefined
    if (!session) throw new DomainError("NOT_FOUND", "Session not found")
    return session
  }

  terminal(terminalId: string): SavedTerminal | undefined {
    const row = this.queries.get`
      SELECT id, session_id, cwd, agents, prompted_at, transcript, updated_at, title, titled_by,
        command, last_program
      FROM terminals WHERE id = ${terminalId}
    ` as TerminalRow | undefined
    return row && { ...listed(row), transcript: row.transcript }
  }

  terminals(sessionId?: string): ListedTerminal[] {
    const rows = (
      sessionId === undefined
        ? this.queries.all`
          SELECT id, session_id, cwd, agents, prompted_at, updated_at, title, titled_by,
            command, last_program
          FROM terminals ORDER BY rowid`
        : this.queries.all`
          SELECT id, session_id, cwd, agents, prompted_at, updated_at, title, titled_by,
            command, last_program
          FROM terminals WHERE session_id = ${sessionId} ORDER BY rowid`
    ) as Omit<TerminalRow, "transcript">[]
    return rows.map(listed)
  }

  nextTerminalNumber(sessionId: string): number {
    const row = this.queries.get`
      INSERT INTO terminal_numbers (session_id, last) VALUES (${sessionId}, 1)
      ON CONFLICT (session_id) DO UPDATE SET last = last + 1
      RETURNING last
    ` as { last: number }
    return row.last
  }

  renameTerminal(terminalId: string, title: string): boolean {
    const result = this.queries
      .run`UPDATE terminals SET title = ${title}, titled_by = NULL WHERE id = ${terminalId}`
    return result.changes > 0
  }

  terminalTitle(terminalId: string): { title: string | null; titledBy: string | null } | undefined {
    const row = this.queries.get`
      SELECT title, titled_by AS titledBy FROM terminals WHERE id = ${terminalId}
    ` as { title: string | null; titledBy: string | null } | undefined
    return row && { title: row.title, titledBy: row.titledBy }
  }

  /** Saves what restores the terminal; `transcript` is left as it is when omitted. */
  saveTerminal(
    terminal: Omit<SavedTerminal, "transcript" | "savedAt"> & { transcript?: string | null },
  ): void {
    const agents = JSON.stringify(terminal.agents)
    // Strictly increasing, so saves in the same millisecond still sort by recency.
    const now = Math.max(Date.now(), this.lastSave + 0.001)
    this.lastSave = now
    const { title, titledBy, command, lastProgram } = terminal
    if (terminal.transcript === undefined)
      void this.queries.run`
        INSERT INTO terminals (id, session_id, cwd, agents, prompted_at, updated_at, title,
          titled_by, command, last_program)
        VALUES (${terminal.id}, ${terminal.sessionId}, ${terminal.cwd}, ${agents},
          ${terminal.promptedAt}, ${now}, ${title}, ${titledBy}, ${command}, ${lastProgram})
        ON CONFLICT (id) DO UPDATE SET session_id = excluded.session_id, cwd = excluded.cwd,
          agents = excluded.agents, prompted_at = excluded.prompted_at,
          updated_at = excluded.updated_at, title = excluded.title,
          titled_by = excluded.titled_by, command = excluded.command,
          last_program = excluded.last_program
      `
    else
      void this.queries.run`
        INSERT INTO terminals (id, session_id, cwd, agents, prompted_at, transcript, updated_at,
          title, titled_by, command, last_program)
        VALUES (${terminal.id}, ${terminal.sessionId}, ${terminal.cwd}, ${agents},
          ${terminal.promptedAt}, ${terminal.transcript}, ${now}, ${title}, ${titledBy},
          ${command}, ${lastProgram})
        ON CONFLICT (id) DO UPDATE SET session_id = excluded.session_id, cwd = excluded.cwd,
          agents = excluded.agents, prompted_at = excluded.prompted_at,
          transcript = excluded.transcript, updated_at = excluded.updated_at,
          title = excluded.title, titled_by = excluded.titled_by,
          command = excluded.command, last_program = excluded.last_program
      `
  }

  removeTerminal(terminalId: string): void {
    void this.queries.run`DELETE FROM terminals WHERE id = ${terminalId}`
  }

  forgetAgent(agent: AgentName): void {
    const rows = this.queries.all`SELECT id, agents FROM terminals` as Pick<
      TerminalRow,
      "id" | "agents"
    >[]
    for (const row of rows) {
      const { [agent]: forgotten, ...rest } = agentsOf(row.agents)
      if (forgotten)
        void this.queries
          .run`UPDATE terminals SET agents = ${JSON.stringify(rest)} WHERE id = ${row.id}`
    }
  }

  clearTranscripts(): void {
    void this.queries.run`UPDATE terminals SET transcript = NULL`
  }

  handles(): HandleRecord[] {
    return this.queries.all`
      SELECT terminal_id AS terminalId, project_id AS projectId, handle, removed_at AS removedAt
      FROM handles
    ` as HandleRecord[]
  }

  assignHandle(terminalId: string, projectId: string, prefix: string): string {
    this.database.exec("BEGIN IMMEDIATE")
    try {
      const known = this.queries
        .get`SELECT handle FROM handles WHERE terminal_id = ${terminalId}` as
        | { handle: string }
        | undefined
      let handle = known?.handle
      if (handle === undefined) {
        const counter = this.queries.get`
          SELECT last FROM handle_counters WHERE project_id = ${projectId} AND prefix = ${prefix}
        ` as { last: number } | undefined
        const next = (counter?.last ?? 0) + 1
        void this.queries.run`
          INSERT INTO handle_counters (project_id, prefix, last) VALUES (${projectId}, ${prefix}, ${next})
          ON CONFLICT (project_id, prefix) DO UPDATE SET last = excluded.last
        `
        handle = `${prefix}-${next}`
        void this.queries.run`
          INSERT INTO handles (terminal_id, project_id, handle) VALUES (${terminalId}, ${projectId}, ${handle})
        `
      }
      this.database.exec("COMMIT")
      return handle
    } catch (error) {
      this.database.exec("ROLLBACK")
      throw error
    }
  }

  terminalSaved(terminalId: string): boolean {
    return this.queries.get`SELECT 1 AS saved FROM terminals WHERE id = ${terminalId}` !== undefined
  }

  markRemoved(terminalId: string, at: number | null): void {
    void this.queries.run`UPDATE handles SET removed_at = ${at} WHERE terminal_id = ${terminalId}`
  }

  removeHandles(terminalIds: readonly string[]): void {
    for (const id of terminalIds)
      void this.queries.run`DELETE FROM handles WHERE terminal_id = ${id}`
  }

  messages(): Message[] {
    return (this.queries.all`SELECT * FROM messages ORDER BY sent_at` as MessageRow[]).map(
      messageOf,
    )
  }

  saveMessage(message: Message): void {
    const { from, to } = message
    void this.queries.run`
      INSERT INTO messages (id, project_id, thread_id, hop, from_terminal, from_handle, from_agent,
        from_session, to_terminal, to_handle, to_agent, to_session, text, sent_at, state,
        delivered_at, notified)
      VALUES (${message.id}, ${message.projectId}, ${message.thread}, ${message.hop},
        ${from.terminalId}, ${from.handle}, ${from.agent}, ${from.sessionId}, ${to.terminalId},
        ${to.handle}, ${to.agent}, ${to.sessionId}, ${message.text}, ${message.sentAt},
        ${message.state}, ${message.deliveredAt}, ${message.notified ? 1 : 0})
      ON CONFLICT (id) DO UPDATE SET to_session = excluded.to_session, state = excluded.state,
        delivered_at = excluded.delivered_at, notified = excluded.notified
    `
  }

  removeMessages(ids: readonly string[]): void {
    for (const id of ids) void this.queries.run`DELETE FROM messages WHERE id = ${id}`
  }

  threads(): Thread[] {
    return (this.queries.all`SELECT * FROM message_threads` as ThreadRow[]).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      between: [row.first_terminal, row.second_terminal],
      hops: row.hops,
      allowed: row.allowed,
      lastAt: row.last_at,
    }))
  }

  saveThread(thread: Thread): void {
    const [first, second] = thread.between
    void this.queries.run`
      INSERT INTO message_threads (id, project_id, first_terminal, second_terminal, hops, allowed, last_at)
      VALUES (${thread.id}, ${thread.projectId}, ${first}, ${second}, ${thread.hops},
        ${thread.allowed}, ${thread.lastAt})
      ON CONFLICT (id) DO UPDATE SET hops = excluded.hops, allowed = excluded.allowed,
        last_at = excluded.last_at
    `
  }

  removeThreads(ids: readonly string[]): void {
    for (const id of ids) void this.queries.run`DELETE FROM message_threads WHERE id = ${id}`
  }

  works(): { terminalId: string; work: Work }[] {
    const rows = this.queries.all`
      SELECT id, work FROM terminals WHERE work IS NOT NULL
    ` as { id: string; work: string }[]
    return rows.flatMap(({ id, work }) => {
      try {
        return [{ terminalId: id, work: JSON.parse(work) as Work }]
      } catch {
        return []
      }
    })
  }

  saveWork(terminalId: string, work: Work): void {
    void this.queries
      .run`UPDATE terminals SET work = ${JSON.stringify(work)} WHERE id = ${terminalId}`
  }

  messagingPaused(): boolean {
    const row = this.queries.get`SELECT value FROM settings WHERE key = 'messagingPaused'` as
      | { value: string }
      | undefined
    return row?.value === "true"
  }

  pauseMessaging(paused: boolean): void {
    void this.queries.run`
      INSERT INTO settings (key, value) VALUES ('messagingPaused', ${String(paused)})
      ON CONFLICT (key) DO UPDATE SET value = excluded.value
    `
  }

  settings(): RunnerSettings {
    const rows = this.queries.all`SELECT key, value FROM settings` as {
      key: string
      value: string
    }[]
    const saved = new Map(rows.map((row) => [row.key, row.value]))
    // Transcripts are kept unless turned off; the welcome dialog waits until seen.
    return {
      transcripts: saved.get("transcripts") !== "false",
      welcomed: saved.get("welcomed") === "true",
    }
  }

  saveSettings(settings: SettingsChange): void {
    for (const [key, value] of Object.entries(settings))
      if (value !== undefined)
        void this.queries.run`
        INSERT INTO settings (key, value) VALUES (${key}, ${String(value)})
        ON CONFLICT (key) DO UPDATE SET value = excluded.value
      `
  }

  close(): void {
    if (this.database.isOpen) {
      this.queries.clear()
      this.database.close()
    }
  }
}
