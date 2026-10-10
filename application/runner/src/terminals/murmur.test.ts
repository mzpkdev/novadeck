import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, vi } from "vitest"

import type { Items } from "../harnesses/replies.js"
import type { Description, Digest } from "../murmur/describer.js"
import { describe, expect, it } from "../test.js"
import { FakeDescriber } from "../testing/describer.js"
import {
  agentDigest,
  commandOf,
  Descriptions,
  Murmur,
  placeName,
  promptsOf,
  replyChars,
  replyTail,
  screenOf,
  screenRows,
  shellDigest,
  tailOf,
  type Facts,
  type MurmurHost,
  type MurmurSubject,
} from "./murmur.js"
import { unnamed } from "./naming.js"
import { freshWork, promptChars, shorten, type Work } from "./work.js"

const work = (fields: Partial<Work> = {}): Work => ({
  ...freshWork("claude:s1"),
  first: "Fix the login bug",
  latest: "Fix the login bug",
  recent: ["Fix the login bug"],
  ...fields,
})

describe("the digest of an agent's terminal", () => {
  const input = {
    harness: "claude" as const,
    projectFolder: "/home/me/shop",
    cwd: "/home/me/shop/services/auth",
    branch: "fix/login",
    plan: "Repair the session cookie",
    work: work({ folders: { "/home/me/shop/services/auth": 4, "/home/me/elsewhere/lib": 2 } }),
    reply: "Done, the cookie is set.",
    previous: null,
  }

  it("is built from the project, place, branch, plan, folders, prompts and reply", () => {
    expect(agentDigest(input)).toEqual({
      kind: "agent",
      harness: "Claude Code",
      project: "shop",
      folder: "services/auth",
      branch: "fix/login",
      plan: "Repair the session cookie",
      // Inside the project relative to it, outside by its last segments.
      folders: ["services/auth", "elsewhere/lib"],
      prompts: ["Fix the login bug"],
      reply: "Done, the cookie is set.",
      previous: null,
    })
  })

  it("passes murmur's last description for stability, and names no project it can't", () => {
    const previous = { title: "Fixing login", summary: "Fixes login." }
    expect(agentDigest({ ...input, previous, projectFolder: undefined })).toMatchObject({
      project: null,
      previous,
    })
  })

  it("is none before the person has prompted", () => {
    expect(agentDigest({ ...input, work: freshWork("claude:s1") })).toBeNull()
    expect(agentDigest({ ...input, work: null })).toBeNull()
  })

  it("shows the first prompt beside the recent ones once it left them, the current one last", () => {
    const recent = ["two", "three", "four", "five", "six"]
    expect(promptsOf(work({ first: "one", latest: "six", recent }))).toEqual(["one", ...recent])
    // Still among them: not shown twice.
    expect(promptsOf(work({ first: "one", latest: "five", recent: ["one", "two"] }))).toEqual([
      "one",
      "two",
    ])
    // The first is cut short in `work`; the long form among the recent ones is the same prompt.
    const long = `one ${"word ".repeat(80)}`.trim()
    const short = work({ first: shorten(long, promptChars), recent: [long] })
    expect(promptsOf(short)).toEqual([long])
    expect(promptsOf(null)).toEqual([])
  })

  it("names a place by its last two segments", () => {
    expect(placeName("/home/me/shop/services/auth")).toBe("services/auth")
    expect(placeName("C:\\w\\shop\\")).toBe("w/shop")
    expect(placeName("/")).toBe("/")
  })
})

// One line of a fake transcript: "role:kind:text".
const items: Items = (line) => {
  const [role, kind, ...text] = line.split(":")
  return role && kind ? [{ role, kind, text: text.join(":") } as ReturnType<Items>[number]] : []
}

describe("the tail of an agent's reply", () => {
  it("keeps the end of a long text, with an ellipsis where it was cut", () => {
    expect(tailOf("short", 10)).toBe("short")
    const tail = tailOf("a".repeat(50) + "END", 10)
    expect([...tail]).toHaveLength(10)
    expect(tail.startsWith("…")).toBe(true)
    expect(tail.endsWith("aaaaaaEND")).toBe(true)
  })

  describe("read from the transcript", () => {
    let directory: string
    beforeEach(() => {
      directory = mkdtempSync(join(tmpdir(), "novadeck-reply-"))
    })
    afterEach(() => rmSync(directory, { recursive: true, force: true }))

    const transcript = (...lines: string[]) => {
      const path = join(directory, "t.jsonl")
      writeFileSync(path, lines.join("\n"))
      return path
    }

    it("is the last text since the person's prompt and the latest tool step, up to the cap", async () => {
      const path = transcript(
        "user:text:fix it",
        "assistant:text:Looking.",
        "assistant:tool-call:Read",
        "tool:tool-result:ok",
        `assistant:text:${"x".repeat(replyChars + 500)}FINAL`,
      )
      const reply = await replyTail(path, items)
      expect([...reply!]).toHaveLength(replyChars)
      expect(reply!.endsWith("FINAL")).toBe(true)
      expect(reply!.startsWith("…")).toBe(true)
    })

    it("is null while the turn has said nothing yet, or when the transcript can't be read", async () => {
      expect(await replyTail(transcript("user:text:fix it"), items)).toBeNull()
      expect(
        await replyTail(transcript("user:text:a", "assistant:text:b", "user:text:c"), items),
      ).toBeNull()
      expect(await replyTail(join(directory, "missing.jsonl"), items)).toBeNull()
    })

    it("drops terminal escapes and control characters", async () => {
      const path = transcript("assistant:text:\u001b[31mred\u001b[0m and \u0007bell")
      expect(await replyTail(path, items)).toBe("red and  bell")
    })
  })
})

describe("the digest of a plain shell", () => {
  it("is the command, the place and the visible rows, trimmed", () => {
    expect(
      shellDigest({
        projectFolder: "/home/me/shop",
        cwd: "/home/me/shop/web",
        command: "pnpm dev",
        rows: ["", "  vite ready  ", "", "$ ", "", ""],
        previous: null,
      }),
    ).toEqual({
      kind: "shell",
      project: "shop",
      folder: "shop/web",
      command: "pnpm dev",
      screen: ["vite ready", "", "$"],
      previous: null,
    })
  })

  it("has nothing to say of a bare prompt, with no program, but of a program with no output", () => {
    const bare = { projectFolder: undefined, cwd: "/w", previous: null }
    expect(shellDigest({ ...bare, command: null, rows: ["$ ", ""] })).toBeNull()
    expect(shellDigest({ ...bare, command: null, rows: ["ls", "a b c", "$"] })).not.toBeNull()
    expect(shellDigest({ ...bare, command: "sleep 60", rows: [] })).toMatchObject({
      command: "sleep 60",
      screen: [],
    })
  })

  it("keeps the lowest rows of a tall screen, each cut, without escapes", () => {
    const rows = Array.from({ length: 50 }, (_, index) => `row ${index}`)
    const kept = screenOf(rows)
    expect(kept).toHaveLength(screenRows)
    expect(kept.at(-1)).toBe("row 49")
    expect(screenOf(["\u001b[1mbold\u001b[0m"])).toEqual(["bold"])
    expect(screenOf(["x".repeat(400)])[0]!.length).toBeLessThanOrEqual(160)
  })

  it("names the program by its command line where the platform tells it, else by its name", () => {
    expect(commandOf({ name: "node", argv: ["node", "server.js", "--port", "80"] }, "bash")).toBe(
      "node server.js --port 80",
    )
    expect(commandOf({ name: "vim", argv: null }, "bash")).toBe("vim")
    // The shell's own name is its prompt, and Windows tells none.
    expect(commandOf({ name: "bash", argv: null }, "bash")).toBeNull()
    expect(commandOf(null, "bash")).toBeNull()
  })
})

const text = (title: string): Description => ({ title, summary: `${title}.` })

describe("the descriptions of a terminal", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const digest = {
    kind: "shell",
    project: null,
    folder: null,
    command: "a",
    screen: [],
    previous: null,
  } as const

  it("waits out its quiet: a newer request restarts the wait, and one description is made", async () => {
    const describer = new FakeDescriber()
    const descriptions = new Descriptions(describer)
    const done = vi.fn<(description: Description, digest: Digest) => void>()
    const build = vi.fn<() => Promise<Digest>>(() => Promise.resolve(digest))
    descriptions.request("a", 100, build, done)
    await vi.advanceTimersByTimeAsync(60)
    descriptions.request("a", 100, build, done)
    await vi.advanceTimersByTimeAsync(60)
    expect(build).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60)
    expect(build).toHaveBeenCalledTimes(1)
    expect(done).toHaveBeenCalledTimes(1)
    expect(descriptions.busy("a")).toBe(false)
  })

  it("has at most one job per terminal: a newer digest aborts the older, whose answer is dropped", async () => {
    const describer = new FakeDescriber()
    describer.hold = true
    const descriptions = new Descriptions(describer)
    const done = vi.fn<(description: Description, digest: Digest) => void>()
    descriptions.request("a", 10, () => Promise.resolve({ ...digest, command: "first" }), done)
    await vi.advanceTimersByTimeAsync(10)
    expect(describer.jobs).toHaveLength(1)
    expect(descriptions.busy("a")).toBe(true)
    descriptions.request("a", 10, () => Promise.resolve({ ...digest, command: "second" }), done)
    await vi.advanceTimersByTimeAsync(10)
    expect(describer.jobs).toHaveLength(2)
    expect(describer.jobs[0]!.signal?.aborted).toBe(true)
    expect(describer.jobs[1]!.signal?.aborted).toBe(false)
    // Even an answer the aborted job still gives lands nowhere.
    describer.jobs[0]!.answer(text("Old"))
    describer.jobs[1]!.answer(text("New"))
    await vi.advanceTimersByTimeAsync(0)
    expect(done.mock.calls.map(([description]) => (description as Description).title)).toEqual([
      "New",
    ])
  })

  it("does not coalesce different terminals", async () => {
    const describer = new FakeDescriber()
    const descriptions = new Descriptions(describer)
    const done = vi.fn<(description: Description, digest: Digest) => void>()
    descriptions.request("a", 10, () => Promise.resolve(digest), done)
    descriptions.request("b", 10, () => Promise.resolve(digest), done)
    await vi.advanceTimersByTimeAsync(10)
    expect(done).toHaveBeenCalledTimes(2)
  })

  it("drops a request whose build has nothing, and an answer from a describer with none", async () => {
    const describer = new FakeDescriber({ reply: () => undefined })
    const descriptions = new Descriptions(describer)
    const done = vi.fn<(description: Description, digest: Digest) => void>()
    descriptions.request("a", 10, () => Promise.resolve(undefined), done)
    descriptions.request("b", 10, () => Promise.resolve(digest), done)
    await vi.advanceTimersByTimeAsync(10)
    expect(describer.jobs).toHaveLength(1)
    expect(done).not.toHaveBeenCalled()
  })

  it("withdraws a request that waits, and cancels a running job when the terminal is gone", async () => {
    const describer = new FakeDescriber()
    describer.hold = true
    const descriptions = new Descriptions(describer)
    const done = vi.fn<(description: Description, digest: Digest) => void>()
    descriptions.request("a", 10, () => Promise.resolve(digest), done)
    descriptions.withdraw("a")
    await vi.advanceTimersByTimeAsync(10)
    expect(describer.jobs).toHaveLength(0)
    descriptions.request("a", 10, () => Promise.resolve(digest), done)
    await vi.advanceTimersByTimeAsync(10)
    // A job that runs goes on past a withdrawal, until the terminal is gone.
    descriptions.withdraw("a")
    expect(describer.jobs[0]!.signal?.aborted).toBe(false)
    descriptions.cancel("a")
    expect(describer.jobs[0]!.signal?.aborted).toBe(true)
    describer.jobs[0]!.answer(text("Late"))
    await vi.advanceTimersByTimeAsync(0)
    expect(done).not.toHaveBeenCalled()
    expect(descriptions.busy("a")).toBe(false)
  })

  it("survives a describer that fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const describer = new FakeDescriber({
      reply: () => {
        throw new Error("boom")
      },
    })
    const descriptions = new Descriptions(describer)
    const done = vi.fn<(description: Description, digest: Digest) => void>()
    descriptions.request("a", 10, () => Promise.resolve(digest), done)
    await vi.advanceTimersByTimeAsync(10)
    expect(done).not.toHaveBeenCalled()
    expect(descriptions.busy("a")).toBe(false)
    error.mockRestore()
  })
})

const settle = (ms = 150) => vi.advanceTimersByTimeAsync(ms)

// A host over terminals a test changes in place, remembering what murmur wrote.
const create = (initial: Partial<MurmurSubject> = {}, describer = new FakeDescriber()) => {
  const base: MurmurSubject = {
    summary: {
      id: "a",
      sessionId: "s",
      cwd: "/home/me/shop",
      process: null,
    } as MurmurSubject["summary"],
    naming: unnamed,
    work: null,
    activity: null,
    openedBy: null,
    agent: "claude",
    transcript: null,
    program: null,
    shell: "bash",
    ...initial,
  }
  const subjects = new Map<string, MurmurSubject>([["a", base]])
  const facts: { current: Facts } = { current: { plan: null, folder: null, branch: "main" } }
  const rows: { current: readonly string[] } = { current: ["$ ls", "a b", "$ "] }
  const replies: { current: string | null } = { current: null }
  const written: Description[] = []
  const host: MurmurHost = {
    subject: (id) => subjects.get(id),
    subjects: () => [...subjects.values()],
    facts: () => Promise.resolve(facts.current),
    screen: () => Promise.resolve(rows.current),
    items: () => undefined,
    projectFolder: () => "/home/me/shop",
    described: (id, description) => {
      written.push(description)
      const subject = subjects.get(id)
      if (subject)
        subjects.set(id, { ...subject, naming: { ...subject.naming, murmur: description } })
    },
  }
  const change = (fields: Partial<MurmurSubject>, id = "a") =>
    subjects.set(id, { ...subjects.get(id)!, ...fields })
  const times = { settleMs: 100, shellRunMs: 500, shellSettleMs: 200, promptsBetween: 3 }
  const murmur = new Murmur(describer, host, times)
  // The replies the host gives are read from the transcript; here, from the activity.
  return { murmur, describer, subjects, facts, rows, replies, written, change, times }
}

const idle = (reply: string | null) =>
  ({ state: "idle", lastTurn: { reply } }) as unknown as MurmurSubject["activity"]
const working = () => ({ state: "working", lastTurn: null }) as unknown as MurmurSubject["activity"]
const report = (fields: Partial<Parameters<Murmur["reported"]>[1]> = {}) => ({
  session: false,
  compacted: false,
  prompts: 0,
  ended: false,
  ...fields,
})

describe("when an agent's terminal is described", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("waits for the person's first prompt of a new root session, then describes it once", async () => {
    const { murmur, describer, change, written } = create()
    await murmur.reported("a", report({ session: true }))
    await settle()
    expect(describer.jobs).toHaveLength(0)
    // Hook after hook meanwhile is not a new request each.
    change({ work: work(), activity: working() })
    await murmur.reported("a", report({ prompts: 1 }))
    await murmur.reported("a", report())
    await murmur.reported("a", report())
    await settle()
    expect(describer.jobs).toHaveLength(1)
    expect(describer.digests[0]).toMatchObject({
      kind: "agent",
      harness: "Claude Code",
      project: "shop",
      branch: "main",
      prompts: ["Fix the login bug"],
      reply: null,
      previous: null,
    })
    expect(written).toEqual([{ title: "Title 1", summary: "Fix the login bug (1)" }])
  })

  it("describes the turn's end again with its reply, since the first was made mid-turn", async () => {
    const { murmur, describer, change } = create({ work: work(), activity: working() })
    await murmur.reported("a", report({ prompts: 1 }))
    await settle()
    expect(describer.jobs).toHaveLength(1)
    change({ activity: idle("Fixed the cookie path.") })
    await murmur.reported("a", report({ ended: true }))
    await settle()
    expect(describer.jobs).toHaveLength(2)
    expect(describer.digests[1]).toMatchObject({
      reply: "Fixed the cookie path.",
      previous: { title: "Title 1" },
    })
    // That one had the whole turn: the next turn's end alone describes nothing.
    await murmur.reported("a", report({ prompts: 1 }))
    await murmur.reported("a", report({ ended: true }))
    await settle()
    expect(describer.jobs).toHaveLength(2)
  })

  it("describes after the person's every few prompts, at a turn's end, not at each", async () => {
    const { murmur, describer, change, times } = create({
      work: work(),
      activity: idle("ok"),
    })
    await murmur.reported("a", report({ prompts: 1, ended: true }))
    await settle()
    expect(describer.jobs).toHaveLength(1)
    for (let count = 1; count < times.promptsBetween; count += 1) {
      change({ work: work({ recent: ["Fix the login bug", `prompt ${count}`] }) })
      // eslint-disable-next-line no-await-in-loop -- Turns come one after another.
      await murmur.reported("a", report({ prompts: 1, ended: true }))
      // eslint-disable-next-line no-await-in-loop -- As above.
      await settle()
    }
    expect(describer.jobs).toHaveLength(1)
    await murmur.reported("a", report({ prompts: 1, ended: true }))
    await settle()
    expect(describer.jobs).toHaveLength(2)
  })

  it("describes after a compaction, and on a new session once its first prompt is known", async () => {
    const { murmur, describer, change } = create({ work: work(), activity: idle("ok") })
    await murmur.reported("a", report({ prompts: 1, ended: true }))
    await settle()
    await murmur.reported("a", report({ compacted: true }))
    await settle()
    expect(describer.jobs).toHaveLength(2)
    // A new session starts over, but waits for its own first prompt.
    change({ work: freshWork("claude:s2") })
    await murmur.reported("a", report({ session: true }))
    await settle()
    expect(describer.jobs).toHaveLength(2)
    change({
      work: work({ session: "claude:s2", first: "Write the docs", recent: ["Write the docs"] }),
    })
    await murmur.reported("a", report({ prompts: 1 }))
    await settle()
    expect(describer.jobs).toHaveLength(3)
    expect(describer.digests[2]).toMatchObject({ prompts: ["Write the docs"] })
  })

  it("describes when the plan, branch or busiest folder drifted, once for each drift", async () => {
    const { murmur, describer, facts, change } = create({
      work: work(),
      activity: idle("ok"),
    })
    facts.current = { plan: "Repair cookie", folder: "/home/me/shop/auth", branch: "main" }
    await murmur.reported("a", report({ prompts: 1, ended: true }))
    await settle()
    expect(describer.jobs).toHaveLength(1)
    // Nothing changed, or only what was unknown: no drift.
    await murmur.reported("a", report({ ended: true }))
    facts.current = { plan: null, folder: null, branch: "main" }
    await murmur.reported("a", report({ ended: true }))
    await settle()
    expect(describer.jobs).toHaveLength(1)
    // The branch changed: drift.
    facts.current = { plan: "Repair cookie", folder: "/home/me/shop/auth", branch: "fix/login" }
    await murmur.reported("a", report({ ended: true }))
    await settle()
    expect(describer.jobs).toHaveLength(2)
    expect(describer.digests[1]).toMatchObject({ branch: "fix/login" })
    change({ activity: idle("again") })
    // Back to where it was described, and again away: each is measured from the last description.
    facts.current = { plan: "New plan", folder: "/home/me/shop/auth", branch: "fix/login" }
    await murmur.reported("a", report({ ended: true }))
    await settle()
    expect(describer.jobs).toHaveLength(3)
    await murmur.reported("a", report({ ended: true }))
    await settle()
    expect(describer.jobs).toHaveLength(3)
  })

  it("does nothing in a terminal with no agent, or without being usable", async () => {
    const { murmur, describer, change } = create({ work: work(), agent: null })
    await murmur.reported("a", report({ prompts: 1, ended: true }))
    await settle()
    expect(describer.jobs).toHaveLength(0)
    change({ agent: "claude" })
    describer.setUsable(false)
    await murmur.reported("a", report({ prompts: 1, ended: true }))
    await settle()
    expect(describer.jobs).toHaveLength(0)
  })

  it("coalesces a burst into one job, and a newer digest aborts the job still running", async () => {
    const { murmur, describer, change } = create({ work: work(), activity: idle("ok") })
    describer.hold = true
    await murmur.reported("a", report({ prompts: 1, ended: true }))
    await settle()
    expect(describer.jobs).toHaveLength(1)
    change({ work: work({ recent: ["Fix the login bug", "and the signup"] }) })
    await murmur.reported("a", report({ compacted: true }))
    await settle()
    expect(describer.jobs).toHaveLength(2)
    expect(describer.jobs[0]!.signal?.aborted).toBe(true)
    expect(describer.digests[1]).toMatchObject({ prompts: ["Fix the login bug", "and the signup"] })
  })

  it("shows the preview of the last reply where no transcript tells more, once the turn is over", async () => {
    const { murmur, describer, change } = create({ work: work(), activity: working() })
    change({ activity: working() })
    await murmur.reported("a", report({ prompts: 1, compacted: true }))
    await settle()
    expect(describer.digests[0]).toMatchObject({ reply: null })
    change({ activity: idle("Cookie fixed.") })
    await murmur.reported("a", report({ ended: true }))
    await settle()
    expect(describer.digests[1]).toMatchObject({ reply: "Cookie fixed." })
  })

  it("never names a terminal with a title that can't be one", async () => {
    for (const title of ["two\nlines", "", "x".repeat(300)]) {
      const { murmur, written } = create(
        { work: work(), activity: idle(null) },
        new FakeDescriber({ reply: () => ({ title, summary: "Fixes it." }) }),
      )
      // eslint-disable-next-line no-await-in-loop -- One terminal after another.
      await murmur.reported("a", report({ prompts: 1 }))
      // eslint-disable-next-line no-await-in-loop -- As above.
      await settle()
      expect(written).toEqual([])
    }
    const { murmur, written } = create(
      { work: work(), activity: idle(null) },
      new FakeDescriber({ reply: () => ({ title: "  Fixing login  ", summary: " Fixes it. " }) }),
    )
    await murmur.reported("a", report({ prompts: 1 }))
    await settle()
    expect(written).toEqual([{ title: "Fixing login", summary: "Fixes it." }])
  })
})

describe("when a plain shell's terminal is described", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const dev = { name: "node", argv: ["node", "dev.js"] }

  it("describes a program that has run a few seconds, not a command that ended sooner", async () => {
    const { murmur, describer, change, times } = create({ agent: null })
    change({ program: { name: "ls", argv: ["ls"] } })
    murmur.sampled("a")
    await settle(times.shellRunMs - 100)
    // Back at the prompt before it ran long enough.
    change({ program: { name: "bash", argv: null } })
    murmur.sampled("a")
    await settle(2_000)
    expect(describer.jobs).toHaveLength(0)

    change({ program: dev })
    murmur.sampled("a")
    await settle(times.shellRunMs - 1)
    expect(describer.jobs).toHaveLength(0)
    await settle(2)
    expect(describer.jobs).toHaveLength(1)
    expect(describer.digests[0]).toMatchObject({
      kind: "shell",
      command: "node dev.js",
      screen: ["$ ls", "a b", "$"],
    })
  })

  it("describes again at the prompt after a program that ran long, not after a short one", async () => {
    const { murmur, describer, change, times } = create({ agent: null })
    change({ program: dev })
    murmur.sampled("a")
    await settle(times.shellRunMs + 10)
    expect(describer.jobs).toHaveLength(1)
    await settle(times.shellRunMs)
    change({ program: { name: "bash", argv: null } })
    murmur.sampled("a")
    await settle(times.shellSettleMs + 10)
    expect(describer.jobs).toHaveLength(2)
    expect(describer.digests[1]).toMatchObject({ command: null })
  })

  it("describes nothing for a program that is gone by the time its wait is over", async () => {
    const { murmur, describer, change, times } = create({ agent: null })
    change({ program: dev })
    murmur.sampled("a")
    await settle(times.shellRunMs - 10)
    change({ program: { name: "vim", argv: null } })
    murmur.sampled("a")
    await settle(times.shellRunMs - 100)
    expect(describer.jobs).toHaveLength(0)
    await settle(200)
    expect(describer.jobs).toHaveLength(1)
    expect(describer.digests[0]).toMatchObject({ command: "vim" })
  })

  it("describes when its directory changed, debounced", async () => {
    const { murmur, describer, times } = create({ agent: null })
    murmur.moved("a")
    await settle(times.shellSettleMs - 50)
    murmur.moved("a")
    await settle(times.shellSettleMs - 50)
    expect(describer.jobs).toHaveLength(0)
    await settle(100)
    expect(describer.jobs).toHaveLength(1)
  })

  it("leaves a terminal that runs an agent to its agent triggers", async () => {
    const { murmur, describer } = create({ agent: "claude" })
    murmur.moved("a")
    murmur.sampled("a")
    await settle(2_000)
    expect(describer.jobs).toHaveLength(0)
  })

  it("says nothing of a bare prompt", async () => {
    const { murmur, describer, rows } = create({ agent: null })
    rows.current = ["$ "]
    murmur.moved("a")
    await settle(1_000)
    expect(describer.jobs).toHaveLength(0)
  })
})

describe("when murmur becomes usable", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("describes the running terminals that have no description yet", async () => {
    const { describer, subjects, written, change } = create({ agent: null })
    subjects.set("b", {
      ...subjects.get("a")!,
      summary: { id: "b", sessionId: "s", cwd: "/w" } as MurmurSubject["summary"],
      agent: "claude",
      work: work(),
      activity: idle("ok"),
    })
    subjects.set("c", {
      ...subjects.get("a")!,
      summary: { id: "c", sessionId: "s", cwd: "/w" } as MurmurSubject["summary"],
      agent: "claude",
      work: null,
    })
    subjects.set("d", {
      ...subjects.get("a")!,
      summary: { id: "d", sessionId: "s", cwd: "/w" } as MurmurSubject["summary"],
      agent: "codex",
      work: work(),
      naming: { person: null, agent: null, murmur: { title: "Had one", summary: "Has one." } },
    })
    change({ program: { name: "bash", argv: null } })
    describer.setUsable(false)
    describer.setUsable(true)
    await settle(300)
    // The shell and the agent with a prompt; not the one with no prompt yet, nor the described.
    expect(describer.digests.map((digest) => digest.kind).toSorted()).toEqual(["agent", "shell"])
    expect(written).toHaveLength(2)
  })

  it("asks nothing while murmur is unusable, and nothing once stopped", async () => {
    const { murmur, describer } = create({ work: work(), activity: idle("ok") })
    describer.setUsable(false)
    await murmur.reported("a", report({ prompts: 1, ended: true }))
    await settle()
    expect(describer.jobs).toHaveLength(0)
    murmur.stop()
    describer.setUsable(true)
    await settle(1_000)
    expect(describer.jobs).toHaveLength(0)
  })
})
