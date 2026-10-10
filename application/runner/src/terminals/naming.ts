import type { TitleSource } from "@novadeck/protocol"

export type { TitleSource }

/**
 * What names a terminal (see docs/agent-messaging.md, "Naming"), each layer kept on its
 * own so the title follows their precedence: the person's title; murmur's latest title
 * and summary, written by a local model; and the title the agent that opened the terminal
 * gave through `open_terminal`, with its terminal's handle. The default comes from the
 * terminal's handle.
 */
export type Naming = {
  readonly person: string | null
  readonly agent: { readonly title: string; readonly by: string } | null
  readonly murmur: { readonly title: string; readonly summary: string } | null
}

/** A terminal nothing named yet. */
export const unnamed: Naming = { person: null, agent: null, murmur: null }

/** A session's default title for its terminal with this handle: `t3` is "Terminal 03". */
export const defaultTitle = (handle: string): string =>
  `Terminal ${handle.slice(1).padStart(2, "0")}`

/**
 * The terminal's title and who it is from, by precedence: the person, then murmur, then
 * the opening agent's, then the default.
 */
export const titleOf = (
  naming: Naming,
  terminal: { readonly handle: string },
): { readonly title: string; readonly source: TitleSource } => {
  if (naming.person !== null) return { title: naming.person, source: { kind: "person" } }
  if (naming.murmur) return { title: naming.murmur.title, source: { kind: "murmur" } }
  if (naming.agent)
    return {
      title: naming.agent.title,
      source: { kind: "agent", by: naming.agent.by },
    }
  return { title: defaultTitle(terminal.handle), source: { kind: "default" } }
}

/** The summary murmur wrote, which `agents()` lists; null without one. */
export const summaryOf = (naming: Naming): string | null => naming.murmur?.summary ?? null

/** The person's title given, or with null taken away, so the title is automatic again. */
export const renamed = (naming: Naming, title: string | null): Naming => ({
  ...naming,
  person: title,
})

/** The title an agent asked for as it opened the terminal: the opener's, never the person's. */
export const openedWith = (naming: Naming, title: string, by: string): Naming => ({
  ...naming,
  agent: { title, by },
})

/** Murmur's latest description of the terminal. */
export const murmured = (naming: Naming, murmur: { title: string; summary: string }): Naming => ({
  ...naming,
  murmur,
})
