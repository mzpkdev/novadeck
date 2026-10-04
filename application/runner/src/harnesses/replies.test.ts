import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "../test.js"
import type { HarnessEvent } from "./events.js"
import { harnesses } from "./registry.js"
import { lastReply, withReplies } from "./replies.js"

const { transcript: steps } = JSON.parse(
  readFileSync(join(import.meta.dirname, "agy", "fixtures", "transcript.probe.json"), "utf8"),
) as { transcript: object[] }
const items = harnesses.agy.transcripts!.items

const folder = (resources: { defer: (cleanup: () => void) => void }) => {
  const path = mkdtempSync(join(tmpdir(), "novadeck-replies-"))
  resources.defer(() => rmSync(path, { recursive: true, force: true }))
  return path
}

// A user input step of Antigravity's transcript, as it wraps the person's text.
const input = (text: string, step: number) =>
  JSON.stringify({
    step_index: step,
    created_at: "2026-10-01T12:00:05Z",
    source: "USER_EXPLICIT",
    type: "USER_INPUT",
    content: `<USER_REQUEST>\n${text}\n</USER_REQUEST>`,
  })

const base = { agent: "agy", sessionId: "c", instance: "7", startedAt: 1 } as const

describe("an agent's last reply in its transcript", () => {
  it("is the start of what Antigravity said last, as one line", async ({ resources }) => {
    const path = join(folder(resources), "transcript.jsonl")
    writeFileSync(path, `${steps.map((step) => JSON.stringify(step)).join("\n")}\n`)
    const reply = await lastReply(path, items)
    expect(reply).toMatch(/^The implementation is complete\. Created README\.md with hello\./)
    expect(reply!.length).toBeLessThanOrEqual(120)
  })

  it("is nothing once the person prompted again and the agent said nothing since", async ({
    resources,
  }) => {
    const path = join(folder(resources), "transcript.jsonl")
    writeFileSync(path, `${steps.map((step) => JSON.stringify(step)).join("\n")}\n`)
    appendFileSync(path, `${input("And now?", 12)}\n`)
    await expect(lastReply(path, items)).resolves.toBeUndefined()
  })

  it("is nothing when the transcript can't be read", async () => {
    await expect(lastReply("/nonexistent/novadeck/transcript.jsonl", items)).resolves.toBe(
      undefined,
    )
  })
})

// A transcript that records "Done." as the agent's last reply.
const read = (path: string) => Promise.resolve(path === "/t/transcript.jsonl" ? "Done." : "")

describe("a turn's end its hook named no reply for", () => {
  const observed: HarnessEvent = {
    type: "session-observed",
    ...base,
    evidence: "conversation-observed",
    transcript: "/t/transcript.jsonl",
  }
  const ended: HarnessEvent = { type: "turn-ended", ...base, outcome: "completed" }

  it("takes the reply from the transcript the same report names", async () => {
    expect(await withReplies([observed, ended], items, read)).toEqual([
      observed,
      { ...ended, reply: "Done." },
    ])
  })

  it("reads nothing for an end that has a reply, an interrupt, a record, or no transcript", async () => {
    let reads = 0
    const counted = () => {
      reads += 1
      return Promise.resolve("Done.")
    }
    const told = { ...ended, reply: "Said." }
    const interrupted = { ...ended, outcome: "interrupted" } as const
    const recorded = { ...ended, recorded: true } as const
    expect(await withReplies([observed, told], items, counted)).toEqual([observed, told])
    expect(await withReplies([observed, interrupted], items, counted)).toEqual([
      observed,
      interrupted,
    ])
    expect(await withReplies([observed, recorded], items, counted)).toEqual([observed, recorded])
    expect(await withReplies([ended], items, counted)).toEqual([ended])
    expect(await withReplies([observed, ended], undefined, counted)).toEqual([observed, ended])
    expect(reads).toBe(0)
  })
})
