import type { AgentName } from "@novadeck/protocol"

import type { Dialect } from "../model/dialect.js"
import type { Call, Reply } from "../model/script.js"
import type { FakeModel } from "../model/server.js"
import type { Sandbox } from "../sandbox.js"

/**
 * How a test may seed a harness differently from the default, which starts it trusted
 * and straight at its prompt. A harness with no such step ignores the option.
 */
export type Seed = {
  /** False: the project folder is not trusted, so the harness asks first. */
  readonly folderTrusted?: boolean
  /** False: NovaDeck's hooks are not trusted (Codex's "Hooks need review"), so they don't run. */
  readonly hooksTrusted?: boolean
}

/**
 * What a harness shows when a `Seed` leaves something untrusted, for the steps it has: a
 * harness without the step leaves its part out, ignores that seed, and the scenario
 * needing it skips.
 */
export type Trust = {
  /**
   * With `folderTrusted: false`: its question about the project folder. A pattern is its
   * option that trusts the folder as the screen shows it selected (`/❯ 1\. Yes, I trust/`),
   * which `confirm` takes, for a question that shows it selected; a `FolderQuestion` for
   * one that doesn't.
   */
  readonly folder?: RegExp | FolderQuestion
  /**
   * With `hooksTrusted: false`: the screen asking to review NovaDeck's hooks (`shows`),
   * when the harness shows one, and the keys that leave it without trusting them
   * (`skip`, pressed without Enter). Its hooks then don't run, so no session binds.
   */
  readonly hooks?: { readonly shows: RegExp; readonly skip: string }
}

/** A folder-trust question whose option that trusts the folder isn't selected as it shows. */
export type FolderQuestion = {
  /** Text the question shows, whatever is selected. */
  readonly shows: RegExp
  /** The keys that select the option trusting the folder, pressed without Enter (Down). */
  readonly select: string
  /** That option as the screen shows it selected, which `confirm` takes. */
  readonly trusts: RegExp
}

/**
 * How a scenario makes the harness ask the person before a tool runs, and what that
 * question looks like, so the same scenario runs for every harness.
 */
export type Approval = {
  /**
   * A reply that has the agent call a tool its harness asks the person about before
   * running it, as seeded (a shell command no setting allows), given the call it answers.
   */
  readonly request: (call: Call) => Reply
  /** Text the question shows while it waits, for `confirm` and for telling it is up. */
  readonly shows: RegExp
  /** The keys that refuse it, pressed without Enter. */
  readonly deny: string
}

/**
 * How a scenario has the agent start work that runs on after its turn ends, as a
 * background subagent or task, so its end can wake the agent again.
 */
export type Background = {
  /** A reply that has the agent start background work, given the call it answers. */
  readonly start: (call: Call) => Reply
  /** Whether a call is the background work's own, rather than the agent's turn. */
  readonly owns: (call: Call) => boolean
}

/**
 * One harness, as an end-to-end test runs it: its pinned program, pointed at the fake
 * model, in a sandbox of its own, starting straight at its prompt with NovaDeck's plugin
 * connected.
 */
export type AgentSetup = {
  readonly agent: AgentName
  /** The product's name, as a scenario names its tests: "Claude Code", "Codex", "Antigravity". */
  readonly name: string
  readonly dialect: Dialect
  /** What its first screen shows once it is at its prompt. */
  readonly banner: string | RegExp
  /**
   * Whether a session binds as soon as it is at its prompt, before any prompt: Claude Code
   * reports its session as it starts; Codex and Antigravity only with their first prompt.
   */
  readonly bindsAtReady: boolean
  /**
   * Hosts it tries through the proxy on every run, which no setting turns off: their
   * refused tunnels are expected. Any other refused tunnel is not.
   */
  readonly refused: readonly string[]
  /**
   * What the tripwire watches of the harness in the developer's home, relative to it.
   * `searched` are configuration files their own sessions rewrite as they start or run,
   * read and searched only for the sandbox's root, which only a connect or trust that
   * leaked out of the sandbox would write there. `listed` are folders whose entries'
   * names are searched for the sandbox's name. `stamped` are paths whose modification time
   * and size alone are compared, never their contents: a login, which is never read, and
   * plugin folders that change only when a plugin is installed or removed.
   */
  readonly watch: {
    readonly searched: readonly string[]
    readonly listed: readonly string[]
    readonly stamped: readonly string[]
  }
  /**
   * Seeds the harness's configuration inside the sandbox, so it starts at its own prompt
   * with no trust, onboarding, sign-in, update or key screen, for the version installed.
   * Returns what the sandbox's environment gains for it: its config home, the fake
   * model's address and the fake credential. The test's deck then connects NovaDeck's
   * plugin through the harness's own commands, with that environment, as the Connect
   * button does.
   */
  readonly prepare: (
    sandbox: Sandbox,
    model: FakeModel,
    installed: { readonly version: string },
    seed?: Seed,
  ) => Promise<Readonly<Record<string, string>>>
  /** How it asks before a tool runs. */
  readonly approval?: Approval
  /** How its agent starts work that outlives its turn. */
  readonly background?: Background
  /** The keys it reads as Escape, sent alone; the deck waits past its Escape-sequence window. */
  readonly escape?: string
  /** What it shows when a seed leaves the folder or NovaDeck's hooks untrusted. */
  readonly trust?: Trust
  /**
   * Finishes what only the connected plugin makes possible, before any harness starts:
   * Codex trusts NovaDeck's hooks, whose hashes are of the hooks the plugin installed.
   */
  readonly connected?: (sandbox: Sandbox, model: FakeModel, seed?: Seed) => Promise<void>
  /**
   * The hosts of the harness's real API and login, which no request may even try to
   * reach: one that does fails the test, as the fake model was bypassed.
   */
  readonly hosts?: readonly string[]
}
