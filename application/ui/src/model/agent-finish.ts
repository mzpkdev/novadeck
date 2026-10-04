import type { TerminalMetadata } from "./types"

// An agent that finished: its turn over with nothing it started left that wakes it, as
// subagents do, and nothing waiting on the person. `reply` is the start of its last
// reply, where its harness tells it.
export type AgentFinish = { readonly reply?: string }

// Whether an agent is working, its turn or subagents it left: it has not finished.
const working = (terminal: TerminalMetadata | undefined): boolean =>
  terminal?.state === "running" && terminal.agent?.working === true

// The finish a status change tells, or undefined: an agent working before, idle now with
// nothing waiting on the person, its turn completed or failed on its own. Background
// commands may run on, as a dev server may for ever. An interrupt by the person, or an
// idle that says no more (Antigravity's Escape or refusal), is no finish: they were there.
// An agent NovaDeck can't hear from, or one that went away, never finishes here.
export const agentFinish = (
  before: TerminalMetadata | undefined,
  after: TerminalMetadata,
): AgentFinish | undefined => {
  if (!working(before) || after.state !== "running") return undefined
  const agent = after.agent
  if (!agent || agent.working || agent.attention) return undefined
  const outcome = agent.lastTurn?.outcome
  if (outcome !== "completed" && outcome !== "failed") return undefined
  return agent.lastTurn?.reply === undefined ? {} : { reply: agent.lastTurn.reply }
}

// Whether the agent in a terminal started working again: a new turn, which the person's
// look at its last reply no longer waits on.
export const agentResumed = (
  before: TerminalMetadata | undefined,
  after: TerminalMetadata,
): boolean => !working(before) && working(after)

// What a desktop notification says of a finish: who finished, by the terminal's handle
// where it has one, and the start of its reply.
export const finishNotice = (
  terminal: TerminalMetadata,
  { reply }: AgentFinish,
): { readonly title: string; readonly body: string } => ({
  title: terminal.handle
    ? `${terminal.handle} is done: ${terminal.name}`
    : `${terminal.name} is done`,
  body: reply ?? "Finished its turn.",
})
