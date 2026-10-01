import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach } from "vitest"

import { describe, expect, it } from "../../test.js"
import type { Install } from "../harness.js"
import { startedSession, title, titleSetting } from "./title.js"

describe("Codex's terminal title", () => {
  it("shows its prompt once it says Ready, with the start of its thread's id", () => {
    expect(title("Ready | 01a0f932-a824-7c30-b713-b59ed...", 9)).toEqual({
      type: "prompt-shown",
      agent: "codex",
      instance: null,
      startedAt: 9,
      sessionPrefix: "01a0f932-a824-7c30-b713-b59ed",
    })
    // Its state alone, as it first sets it; or a whole id, which it doesn't cut short.
    expect(title("Ready", 9)).not.toHaveProperty("sessionPrefix")
    expect(title("Ready | 01a0f932-a824-7c30-b713-b59ed562f00b", 9)).toMatchObject({
      sessionPrefix: "01a0f932-a824-7c30-b713-b59ed562f00b",
    })
  })

  it("reads the person's own title the same, whatever else it holds, in any order", () => {
    expect(title("codex | 01a0f932-a824... | myproject | Ready", 9)).toMatchObject({
      sessionPrefix: "01a0f932-a824",
    })
    expect(title("codex | Ready", 9)).toMatchObject({ type: "prompt-shown" })
  })

  it("says nothing while it works, nor for a title it can't read as one state", () => {
    for (const text of [
      "Working | 01a0f932-a824-7c30-b713-b59ed...",
      "Starting | 01a0f932-a824",
      "w",
      "",
      // Two states, or two ids: nothing tells which is Codex's.
      "Ready | Working",
      "Ready | 01a0f932-a824... | 01a0f99f-0000...",
    ])
      expect(title(text, 9)).toBeUndefined()
  })

  it("is the title NovaDeck's shim asks for: its state, then its thread's id", () => {
    expect(titleSetting).toBe("tui.terminal_title=['status','thread-id']")
  })
})

describe("a thread Codex just started", () => {
  const folders: string[] = []
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  })
  // A Codex home whose writer locks are the threads given, each made at its time.
  const home = (threads: { readonly id: string; readonly at: number }[]): Install => {
    const folder = mkdtempSync(join(tmpdir(), "novadeck-codex-"))
    folders.push(folder)
    const locks = join(folder, "thread-writer-locks")
    mkdirSync(locks)
    for (const { id, at } of threads) {
      const file = join(locks, `${id}.lock`)
      writeFileSync(file, "")
      utimesSync(file, at / 1000, at / 1000)
    }
    return { env: { CODEX_HOME: folder }, home: folder, platform: process.platform, plugin: "" }
  }

  it("is one whose writer lock it made since the title, as at /clear", async () => {
    const now = Date.now()
    const where = home([{ id: "01a0f99f-0000-7000-8000-000000000000", at: now }])
    expect(await startedSession(where, "01a0f99f-0000", now, 0)).toBe(true)
  })

  it("is no thread without a lock, as a /side conversation, nor one locked long before", async () => {
    const now = Date.now()
    const where = home([{ id: "01a0f99f-0000-7000-8000-000000000000", at: now - 60_000 }])
    expect(await startedSession(where, "01a0f99f-0000", now, 0)).toBe(false)
    expect(await startedSession(where, "01a0ffff", now, 0)).toBe(false)
  })

  it("waits a moment for a lock made just after the title", async () => {
    const now = Date.now()
    const where = home([])
    setTimeout(
      () => writeFileSync(join(where.home, "thread-writer-locks", "01a0f99f-1111.lock"), ""),
      150,
    )
    expect(await startedSession(where, "01a0f99f-1111", now, 2_000)).toBe(true)
  })
})
