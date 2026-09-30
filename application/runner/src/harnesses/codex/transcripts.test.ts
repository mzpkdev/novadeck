import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "../../test.js"
import { transcripts } from "./transcripts.js"

const { records } = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures", "rollout.probe.json"), "utf8"),
) as { records: object[] }
const items = (lines: readonly object[]) =>
  lines.flatMap((line) => transcripts.items(JSON.stringify(line)))
const item = (payload: object) => ({
  timestamp: "2026-09-29T20:50:21.802Z",
  type: "response_item",
  payload,
})

describe("Codex's rollout, as captured", () => {
  it("gives the tool call and its output, and leaves developer messages out", () => {
    const [call, output, ...rest] = items(records)
    expect(rest).toEqual([])
    expect(call).toMatchObject({ role: "assistant", kind: "tool-call", tool: "exec" })
    expect(output).toMatchObject({ role: "tool", kind: "tool-result", call: call?.call })
    expect(output?.text).toBe("<text>\n<text>\n<text>")
  })
})

describe("Codex's rollout records", () => {
  it("give the person's and the agent's text, but not the context Codex adds", () => {
    expect(
      items([
        item({ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }),
        item({
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "<environment_context>\n</environment_context>" }],
        }),
        item({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "yo" }],
        }),
        item({ type: "reasoning", summary: [] }),
      ]).map(({ role, text }) => `${role}: ${text}`),
    ).toEqual(["user: hi", "assistant: yo"])
  })

  it("give a function call's arguments, and its text output", () => {
    const [call, output] = items([
      item({ type: "function_call", name: "shell", arguments: '{"cmd":"ls"}', call_id: "c1" }),
      item({ type: "function_call_output", call_id: "c1", output: "a\nb" }),
    ])
    expect(call).toMatchObject({ tool: "shell", text: '{"cmd":"ls"}' })
    expect(output).toMatchObject({ text: "a\nb", call: call?.call })
  })
})

describe("Codex's transcripts", () => {
  it("are the session's rollout, and a subagent's beside it, named for its thread", async () => {
    const directory = mkdtempSync(join(tmpdir(), "novadeck-codex-rollouts-"))
    try {
      const root = join(directory, "rollout-2026-09-29T23-05-15-s1.jsonl")
      const child = join(directory, "rollout-2026-09-29T23-06-00-a7.jsonl")
      writeFileSync(root, "")
      writeFileSync(child, "")
      await expect(transcripts.locate(root, "s1", null)).resolves.toBe(root)
      await expect(transcripts.locate(root, "s1", "a7")).resolves.toBe(child)
      await expect(transcripts.locate(root, "s1", "a8")).resolves.toBeUndefined()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
