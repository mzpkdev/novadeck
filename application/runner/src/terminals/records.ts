import type { AgentName } from "@novadeck/protocol"

import type { Naming, TitleSource } from "./naming.js"
import type { Work } from "./work.js"

/** An agent's latest reported session in a terminal; a larger `seq` is a later report. */
export type AgentReport = { readonly sessionId: string; readonly seq: number }

/**
 * What the runner keeps of a terminal: the terminal itself, which exists until it is
 * closed, and what restores it once its shell is gone.
 */
export type SavedTerminal = {
  readonly id: string
  readonly sessionId: string
  /** Its handle in its session, `t3`, which never changes. */
  readonly handle: string
  /** What names it: the person's title, an agent's, and its agent's summary of its work. */
  readonly naming: Naming
  /** Its title, by `naming`'s precedence (see `titleOf`). */
  readonly title: string
  /** Who its title is from. */
  readonly titleSource: TitleSource
  /** The handle of the terminal whose agent opened it with a task; null otherwise. */
  readonly openedBy: string | null
  /** The command it was opened to run; null for a plain shell. */
  readonly command: string | null
  /** The program in its foreground when its shell was last seen. */
  readonly lastProgram: string | null
  /** What its root agent session worked on. */
  readonly work: Work | null
  /** The shell's last reported directory, or where it started. */
  readonly cwd: string
  readonly agents: Partial<Record<AgentName, AgentReport>>
  /** When the shell last showed its prompt, in epoch milliseconds. */
  readonly promptedAt: number | null
  /** The serialized screen and scrollback; null when transcripts are off. */
  readonly transcript: string | null
  /** When it was last saved, in epoch milliseconds. */
  readonly savedAt: number
}

/** A terminal as listed: all but its transcript. */
export type ListedTerminal = Omit<SavedTerminal, "transcript">

/** A terminal's handle, what names it, its title and who it is from, and who opened it with a task. */
export type TerminalIdentity = Pick<
  SavedTerminal,
  "handle" | "naming" | "title" | "titleSource" | "openedBy"
>

/** Where the runner saves terminals: its metadata store. */
export type TerminalRecords = {
  terminal(terminalId: string): SavedTerminal | undefined
  /** Every terminal kept, of one session or all, in the order they were asked for (by number), without transcripts. */
  terminals(sessionId?: string): readonly ListedTerminal[]
  /** The next number of a session's terminals, for a handle and a default title, never given twice. */
  nextTerminalNumber(sessionId: string): number
  /**
   * Gives a kept terminal the person's title, or with null takes theirs away, so its title
   * is automatic again; false when none is kept by that id.
   */
  renameTerminal(terminalId: string, title: string | null): boolean
  /** A kept terminal's handle, what names it and its title, read alone. */
  terminalIdentity(terminalId: string): TerminalIdentity | undefined
  /** `transcript` is left as it is when omitted. */
  saveTerminal(terminal: TerminalToSave): void
  removeTerminal(terminalId: string): void
  clearTranscripts(): void
  /** Forgets every session the agent reported, as once it is disconnected. */
  forgetAgent(agent: AgentName): void
}

/** What saving a terminal takes: its title follows from what names it. */
export type TerminalToSave = Omit<
  SavedTerminal,
  "transcript" | "savedAt" | "title" | "titleSource"
> & {
  transcript?: string | null
}
