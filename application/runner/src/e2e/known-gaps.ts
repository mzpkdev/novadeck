import type { AgentName } from "@novadeck/protocol"

import type { AgentSetup } from "./agents/agent.js"

/**
 * The known gaps in harness parity the end-to-end suite works around (see
 * docs/e2e-testing.md, "Known gaps").
 *
 * A gap is a `Gap` exported here, documented with its cause, the test that pins today's
 * wrong behaviour, and what to assert once it is fixed. The scenarios never ask which
 * harness they run: they ask a function built on `has`, named for the behaviour that
 * differs, and take the detour it picks. Fixing a gap means deleting its entry, that
 * function and the detour, and turning its pin into the real assertion.
 */
export type Gap = {
  /** The harnesses it affects. */
  readonly agents: readonly AgentName[]
  /** The platforms it affects; every one when omitted. */
  readonly platforms?: readonly NodeJS.Platform[]
}

/** Whether the gap affects the setup's harness, on this platform. */
export const has = (gap: Gap, setup: AgentSetup): boolean =>
  gap.agents.includes(setup.agent) &&
  (gap.platforms === undefined || gap.platforms.includes(process.platform))

/**
 * Codex on Windows mostly never gets a character outside Unicode's Basic Multilingual Plane, as
 * the emoji 👨, through the ConPTY that node-pty bundles and Novadeck's terminals run on
 * there: it reads the console's keys, and the character's two UTF-16 halves never reach
 * it, though the joiners between such emoji do (probed 2026-10-09: Codex 0.159.3,
 * OpenConsole 1.25.260303002; Windows' own ConPTY delivers it, as both deliver it to
 * cmd). A prompt holding one never shows whole in its box, so Novadeck presses no Enter
 * and the prompt fails (PROMPT_FAILED). Not every time: one CI run of many (2026-10-10)
 * got it through, the prompt landing as on Linux. Pinned by chat.e2e.ts, "gives its agent
 * emoji sequences and CJK, then the next prompt", which takes either. Once fixed, the
 * prompt lands every time and its turn runs as on Linux.
 */
const astralLost: Gap = { agents: ["codex"], platforms: ["win32"] }

/** Whether the harness loses a character outside the BMP that a prompt pastes. */
export const losesAstral = (setup: AgentSetup): boolean => has(astralLost, setup)
