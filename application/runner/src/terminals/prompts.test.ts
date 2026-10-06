import { setTimeout as sleep } from "node:timers/promises"

import { DomainError } from "../errors.js"
import { describe, expect, it } from "../test.js"
import { Prompts, type PromptHost } from "./prompts.js"

/**
 * A terminal as prompts see it: a screen that a paste changes as `takes` says, and what
 * messaging says of it.
 */
const terminal = (
  options: {
    /** What the TUI makes of a paste: its text in the box, a placeholder, or nothing. */
    takes?: "box" | "placeholder" | "nothing"
    /** Whether a far row changes with every look, as a spinner does. */
    spinner?: boolean
    working?: boolean
    ready?: boolean
    /** Whether its first screen draws a logo, which a paste takes away whole. */
    logo?: boolean
    bracketedPaste?: boolean
    /** A reason `admit` refuses. */
    refuses?: DomainError
    /** The nonce of a ring under way, which `ringEnds` ms from the first look ends. */
    ringing?: string
    ringEnds?: number
    /** How long a hold lasts before it lapses by itself, in milliseconds. */
    holdMs?: number
  } = {},
) => {
  const rows = options.logo
    ? ["header", "", "  logo", "", "", "", "> ", "", "footer"]
    : ["header", "", "", "", "", "", "> ", "", "footer"]
  const written: string[] = []
  const started = Date.now()
  let looks = 0
  let held = false
  let sizes = false
  let holds = 0
  const host: PromptHost = {
    admit: () => {
      if (options.refuses) throw options.refuses
    },
    ringing: () =>
      options.ringing !== undefined && Date.now() - started < (options.ringEnds ?? 0)
        ? options.ringing
        : undefined,
    ready: () => options.ready ?? false,
    working: () => options.working ?? false,
    screen: () => {
      looks += 1
      const shown = [...rows]
      if (options.spinner) shown[1] = `spinner ${looks}`
      return Promise.resolve({ rows: shown, bracketedPaste: options.bracketedPaste ?? true })
    },
    hold: () => {
      if (held || sizes) return { release: () => {}, settle: () => {}, holding: () => false }
      holds += 1
      held = true
      sizes = true
      const lapse =
        options.holdMs === undefined ? undefined : setTimeout(() => (held = false), options.holdMs)
      const release = () => {
        clearTimeout(lapse)
        held = false
      }
      return {
        release,
        settle: () => {
          release()
          sizes = false
        },
        holding: () => held,
      }
    },
    type: (_, data) => {
      written.push(data)
      const pasted = /^\x1b\[200~([\s\S]*)\x1b\[201~$/.exec(data)?.[1] // eslint-disable-line no-control-regex -- A bracketed paste's markers.
      if (pasted === undefined || options.takes === "nothing") return true
      if (options.takes === "placeholder") rows[6] = "> [Pasted text #1 +4 lines]"
      else rows[6] = `> ${pasted}`
      if (options.logo) rows[2] = ""
      return true
    },
  }
  return { host, written, state: () => ({ held, sizes, holds }) }
}

const fast = { pollMs: 5, pasteMs: 150, ringMs: 100, settleMs: 40 }
const enters = (written: readonly string[]) => written.filter((data) => data === "\r").length
const refusal = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise
  } catch (error) {
    return error instanceof DomainError ? error.code : String(error)
  }
  return "none"
}

describe("prompts", () => {
  it("paste a line as one bracketed paste and press Enter once it landed", async () => {
    const { host, written, state } = terminal()
    await new Prompts(host, fast).prompt("t", "Hello there")
    expect(written).toEqual(["\x1b[200~Hello there\x1b[201~", "\r"])
    expect(state().held).toBe(false)
  })

  it("take a multi-line prompt as one paste whose line breaks are returns", async () => {
    const { host, written } = terminal({ takes: "box" })
    await new Prompts(host, fast).prompt("t", "one\ntwo\r\nthree")
    expect(written).toEqual(["\x1b[200~one\rtwo\rthree\x1b[201~", "\r"])
  })

  it("press Enter on text the TUI collapsed to a placeholder once the screen held still", async () => {
    const { host, written } = terminal({ takes: "placeholder" })
    await new Prompts(host, fast).prompt("t", "one\ntwo\nthree\nfour\nfive")
    expect(enters(written)).toBe(1)
  })

  it("never press Enter after a paste that did not show, and leave the draft", async () => {
    const { host, written, state } = terminal({ takes: "nothing" })
    expect(await refusal(new Prompts(host, fast).prompt("t", "Hello there"))).toBe("PROMPT_FAILED")
    expect(written).toEqual(["\x1b[200~Hello there\x1b[201~"])
    expect(state()).toMatchObject({ held: false, sizes: false })
  })

  it("never press Enter for a multi-line paste that changed nothing", async () => {
    const { host, written } = terminal({ takes: "nothing" })
    expect(await refusal(new Prompts(host, fast).prompt("t", "one\ntwo"))).toBe("PROMPT_FAILED")
    expect(enters(written)).toBe(0)
  })

  it("refuse a screen that takes no bracketed paste, writing nothing", async () => {
    const { host, written } = terminal({ bracketedPaste: false })
    expect(await refusal(new Prompts(host, fast).prompt("t", "Hello"))).toBe("CONFLICT")
    expect(written).toEqual([])
  })

  it("refuse as the host does, writing nothing", async () => {
    const { host, written } = terminal({ refuses: new DomainError("CONFLICT") })
    expect(await refusal(new Prompts(host, fast).prompt("t", "Hello"))).toBe("CONFLICT")
    expect(written).toEqual([])
  })

  it("abandon a prompt whose hold lapsed before its Enter, pressing nothing", async () => {
    const { host, written } = terminal({ holdMs: 20 })
    // The lapse comes while the screen is looked at, before it has held still.
    const slow: PromptHost = {
      ...host,
      screen: async () => {
        await sleep(30)
        return host.screen("t")
      },
    }
    expect(await refusal(new Prompts(slow, fast).prompt("t", "Hello"))).toBe("PROMPT_FAILED")
    expect(enters(written)).toBe(0)
  })

  it("take a line that landed among a spinner's changes only while a turn runs", async () => {
    const busy = terminal({ spinner: true, working: true })
    await new Prompts(busy.host, fast).prompt("t", "Then sum it up")
    expect(enters(busy.written)).toBe(1)
    const idle = terminal({ spinner: true })
    expect(await refusal(new Prompts(idle.host, fast).prompt("t", "Then sum it up"))).toBe(
      "PROMPT_FAILED",
    )
    expect(enters(idle.written)).toBe(0)
  })

  it("take a first screen's logo going as the line lands only when the terminal is Ready", async () => {
    const ready = terminal({ logo: true, ready: true })
    await new Prompts(ready.host, fast).prompt("t", "Hello")
    expect(enters(ready.written)).toBe(1)
    const settled = terminal({ logo: true })
    expect(await refusal(new Prompts(settled.host, fast).prompt("t", "Hello"))).toBe(
      "PROMPT_FAILED",
    )
  })

  it("give prompts to one terminal one at a time, each with its own Enter", async () => {
    const { host, written } = terminal()
    const prompts = new Prompts(host, fast)
    await Promise.all([prompts.prompt("t", "First"), prompts.prompt("t", "Second")])
    expect(written).toEqual(["\x1b[200~First\x1b[201~", "\r", "\x1b[200~Second\x1b[201~", "\r"])
  })

  it("go on with the next prompt after one that failed", async () => {
    const { host, written } = terminal({ takes: "nothing" })
    const prompts = new Prompts(host, fast)
    const first = refusal(prompts.prompt("t", "First"))
    const second = refusal(prompts.prompt("t", "Second"))
    expect([await first, await second]).toEqual(["PROMPT_FAILED", "PROMPT_FAILED"])
    expect(written).toHaveLength(2)
  })

  it("wait for a doorbell ring under way to end before it pastes", async () => {
    const { host, written } = terminal({ ringing: "abc", ringEnds: 40 })
    const prompt = new Prompts(host, { ...fast, ringMs: 500 }).prompt("t", "Hello")
    await sleep(15)
    expect(written).toEqual([])
    await prompt
    expect(enters(written)).toBe(1)
  })

  it("refuse when a ring outlasts its wait, writing nothing", async () => {
    const { host, written } = terminal({ ringing: "abc", ringEnds: 10_000 })
    expect(await refusal(new Prompts(host, fast).prompt("t", "Hello"))).toBe("CONFLICT")
    expect(written).toEqual([])
  })

  it("hold the app's resizes past its Enter, and let go for the next prompt at once", async () => {
    const { host, state } = terminal()
    const prompts = new Prompts(host, { ...fast, settleMs: 5_000 })
    await prompts.prompt("t", "First")
    expect(state()).toMatchObject({ held: false, sizes: true })
    await prompts.prompt("t", "Second")
    expect(state().holds).toBe(2)
  })

  it("let the app's resizes go once the wait after its Enter passed", async () => {
    const { host, state } = terminal()
    await new Prompts(host, fast).prompt("t", "First")
    await sleep(80)
    expect(state().sizes).toBe(false)
  })
})
