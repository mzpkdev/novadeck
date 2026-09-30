import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { Report } from "../../shell/reports.js"
import { describe, expect, it as base } from "../../test.js"
import type { Install } from "../harness.js"
import { decode } from "./decode.js"
import { ownStatusLineFile, statusLineCommand, statusLineSettings } from "./settings.js"

const { payloads } = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures", "statusline.probe.json"), "utf8"),
) as { payloads: Report["payload"][] }
const report = (payload: Report["payload"], seq = 5): Report => ({
  terminalId: "t",
  token: "0".repeat(48),
  agent: "agy",
  event: "StatusLine",
  seq,
  instance: "7",
  env: { cursor: false },
  payload,
})
const activity = (payload: Report["payload"]) =>
  decode(report(payload)).filter(
    ({ type }) => type !== "session-observed" && type !== "telemetry-observed",
  )
const telemetry = (payload: Report["payload"]) =>
  decode(report(payload)).find(({ type }) => type === "telemetry-observed")

describe("Antigravity's status line, as captured", () => {
  it("says nothing before a conversation starts", () => {
    for (const payload of payloads.slice(0, 3)) expect(decode(report(payload))).toEqual([])
  })

  it("tells a confirmation waiting on the person, and its answer", () => {
    const [, , , working, confirming, idle] = payloads
    const conversation = { agent: "agy", sessionId: working!.conversation_id, instance: "7" }
    expect(decode(report(working!))[0]).toEqual({
      type: "session-observed",
      ...conversation,
      startedAt: 5,
      evidence: "conversation-observed",
      cwd: "/home/user/project",
    })
    expect(activity(working!)).toMatchObject([{ type: "attention-resolved", loose: false }])
    expect(activity(confirming!)).toEqual([
      {
        type: "attention-requested",
        ...conversation,
        startedAt: 5,
        requestId: "confirmation",
        actor: null,
        toolName: "confirmation",
        kind: "permission",
      },
    ])
    // Denied: the turn ends, and no hook says so.
    expect(activity(idle!)).toMatchObject([{ type: "turn-ended", outcome: "completed" }])
  })

  it("gives the context window's share in use, and each quota window left", () => {
    const idle = payloads.at(-1)!
    const window = idle.context_window as { context_window_size: number; used_percentage: number }
    expect(telemetry(idle)).toMatchObject({
      context: {
        occupied: Math.round((window.context_window_size * window.used_percentage) / 100),
        capacity: window.context_window_size,
      },
      limits: [
        { minutes: 10_080, used: 0, resetsAt: Date.parse("2026-10-07T00:35:50Z") },
        {
          minutes: 10_080,
          used: expect.closeTo(1 - 0.8638056, 6),
          resetsAt: Date.parse("2026-10-06T21:00:32Z"),
        },
      ],
    })
  })

  it("leaves out what it does not know, and never reads the person's account", () => {
    const conversation = payloads.at(-1)!.conversation_id
    const sparse = { conversation_id: conversation, email: "person@example.com" }
    expect(telemetry(sparse)).toEqual({
      type: "telemetry-observed",
      agent: "agy",
      sessionId: conversation,
      instance: "7",
      startedAt: 5,
    })
    const quota = { soon: { remaining_fraction: 0.5, reset_time: "never" } }
    expect(telemetry({ ...sparse, quota })).toMatchObject({
      limits: [{ minutes: null, used: 0.5, resetsAt: null }],
    })
    expect(JSON.stringify(decode(report(sparse)))).not.toContain("person@example.com")
  })
})

type Fixture = { root: string; install: Install; settings: string }

const it = base.extend<{ fixture: Fixture }>({
  fixture: async ({ resources }, use) => {
    const root = mkdtempSync(join(tmpdir(), "novadeck-agy-settings-"))
    resources.defer(() => rmSync(root, { recursive: true, force: true }))
    const home = join(root, "antigravity-cli")
    mkdirSync(home)
    const plugin = join(root, "shell", "plugins", "agy")
    mkdirSync(plugin, { recursive: true })
    const install: Install = { env: {}, home: root, platform: "linux", plugin }
    await use({ root, install, settings: join(home, "settings.json") })
  },
})

const { apply, revert } = statusLineSettings(() => "")
const settingsOf = (fixture: Fixture) =>
  statusLineSettings(() => join(fixture.root, "antigravity-cli"))
const read = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>

describe("connecting Antigravity's status line", () => {
  it("puts NovaDeck's in place beside Antigravity's own, and takes it out again", async ({
    fixture,
  }) => {
    writeFileSync(fixture.settings, JSON.stringify({ trustedWorkspaces: ["/w"] }))
    const settings = settingsOf(fixture)
    await settings.apply(fixture.install)
    await settings.apply(fixture.install)
    expect(read(fixture.settings)).toEqual({
      trustedWorkspaces: ["/w"],
      statusLine: {
        enabled: true,
        stack_with_default: true,
        type: "command",
        command: statusLineCommand(undefined),
      },
    })
    await settings.revert(fixture.install)
    expect(read(fixture.settings)).toEqual({ trustedWorkspaces: ["/w"] })
  })

  it("keeps the person's own status line running, and gives it back", async ({ fixture }) => {
    const own = { type: "command", command: "echo mine", enabled: true, padding: 2 }
    writeFileSync(fixture.settings, JSON.stringify({ statusLine: own }))
    const settings = settingsOf(fixture)
    await settings.apply(fixture.install)
    expect(read(fixture.settings).statusLine).toEqual({
      ...own,
      command: statusLineCommand("echo mine"),
    })
    await settings.revert(fixture.install)
    expect(read(fixture.settings)).toEqual({ statusLine: own })
    expect(() => readFileSync(ownStatusLineFile(fixture.install))).toThrow()
  })

  it("leaves settings it cannot read as they are", async ({ fixture }) => {
    writeFileSync(fixture.settings, "{ not json")
    await expect(settingsOf(fixture).apply(fixture.install)).rejects.toThrow("not valid JSON")
    expect(readFileSync(fixture.settings, "utf8")).toBe("{ not json")
  })

  it("leaves Windows as it is", async ({ fixture }) => {
    await apply({ ...fixture.install, platform: "win32" })
    await revert({ ...fixture.install, platform: "win32" })
    expect(() => readFileSync(fixture.settings)).toThrow()
  })
})

describe.skipIf(process.platform === "win32")("NovaDeck's status line for Antigravity", () => {
  it("hands its input to NovaDeck's hook, then shows the person's own", ({ fixture }) => {
    const hook = join(fixture.root, "hook")
    const log = join(fixture.root, "hook.log")
    writeFileSync(hook, `#!/bin/sh\necho "$1 $2 $(cat)" > "${log}"\necho noise\n`, { mode: 0o755 })
    const own = `cat | tr a-z A-Z; echo; echo "it's mine"`
    const run = (env: NodeJS.ProcessEnv) =>
      spawnSync("sh", ["-c", statusLineCommand(own)], {
        input: '{"a":1}',
        encoding: "utf8",
        env: { ...process.env, ...env },
      }).stdout
    expect(run({ NOVADECK_HOOK: hook })).toBe(`{"A":1}\nit's mine\n`)
    expect(readFileSync(log, "utf8")).toBe('agy StatusLine {"a":1}\n')
    rmSync(log)
    expect(run({ NOVADECK_HOOK: "" })).toBe(`{"A":1}\nit's mine\n`)
    expect(() => readFileSync(log)).toThrow()
  })
})
