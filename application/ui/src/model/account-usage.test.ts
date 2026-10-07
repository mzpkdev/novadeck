import { describe, expect, it } from "../test"
import { accountUsage, nextAccountReset, resetText } from "./account-usage"
import type { AgentUsage, TerminalMetadata } from "./types"

const hour = 3_600_000

const agent = (
  id: string,
  process: string,
  limits: AgentUsage["limits"],
  state: TerminalMetadata["state"] = "running",
): TerminalMetadata =>
  ({
    id,
    name: id,
    directory: "~/work",
    command: process,
    process,
    state,
    ...(state === "running"
      ? { agent: { working: false, usage: { context: null, limits, model: null, effort: null } } }
      : {}),
  }) as TerminalMetadata

describe("the account's subscription usage", () => {
  it("says each agent's windows once, shortest first, most used agent first", () => {
    const accounts = accountUsage(
      [
        agent("1", "claude", [
          { minutes: 10_080, used: 0.18, resetsAt: 9 * hour },
          { minutes: 300, used: 0.42, resetsAt: 2 * hour },
        ]),
        agent("2", "codex", [{ minutes: 300, used: 0.67, resetsAt: hour }]),
      ],
      0,
    )
    expect(accounts.map((account) => account.name)).toEqual(["Codex", "Claude Code"])
    expect(accounts[1]!.windows.map((window) => window.name)).toEqual(["5h", "7d"])
    expect(accounts[1]!.busiest).toMatchObject({ name: "5h", used: 0.42 })
  })

  it("takes the newer of two terminals' readings of a window", () => {
    const [claude] = accountUsage(
      [
        agent("1", "claude", [{ minutes: 300, used: 0.9, resetsAt: hour }]),
        agent("2", "claude", [{ minutes: 300, used: 0.1, resetsAt: 6 * hour }]),
        agent("3", "claude", [{ minutes: 300, used: 0.2, resetsAt: 6 * hour }]),
      ],
      0,
    )
    expect(claude!.windows).toEqual([{ name: "5h", minutes: 300, used: 0.2, resetsAt: 6 * hour }])
  })

  it("leaves out a window once it has reset, and terminals that don't run an agent", () => {
    const accounts = accountUsage(
      [
        agent("1", "claude", [{ minutes: 300, used: 0.9, resetsAt: hour }]),
        agent("2", "zsh", [{ minutes: 300, used: 0.5, resetsAt: null }]),
        agent("3", "codex", [{ minutes: 300, used: 0.5, resetsAt: null }], "idle"),
      ],
      2 * hour,
    )
    expect(accounts).toEqual([])
  })

  it("names when the soonest window resets", () => {
    const accounts = accountUsage(
      [
        agent("1", "claude", [
          { minutes: 300, used: 0.4, resetsAt: hour },
          { minutes: 10_080, used: 0.1, resetsAt: null },
        ]),
      ],
      0,
    )
    expect(nextAccountReset(accounts)).toBe(hour)
  })

  it("says when a window resets: how long from now within a day, the weekday further off", () => {
    const now = new Date(2026, 9, 7, 14, 16).getTime()
    // The time itself is in the viewer's locale.
    expect(resetText(now + 2 * hour + 14 * 60_000, now)).toMatch(/^in 2h 14m · \S/)
    expect(resetText(now + 48 * 60_000, now)).toMatch(/^in 48m · \S/)
    expect(resetText(new Date(2026, 9, 9, 9, 0).getTime(), now)).toMatch(/^Fri \S/)
  })
})
