import { mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { protocolVersion, type RuntimeClient } from "@novadeck/protocol"

import { describe, expect, it } from "./test.js"
import { launchCli } from "./testing/cli.js"
import type { Resources } from "./testing/resources.js"

const token = "novadeck-cli-tests-only-not-a-production-credential"

const directoryFixture = async (resources: Resources) => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "novadeck-cli-")))
  resources.defer(() => rm(directory, { recursive: true, force: true }))
  await writeFile(
    join(directory, ".env"),
    [
      "HOST=127.0.0.1",
      "PORT=0",
      `NOVADECK_TOKEN=${token}`,
      `NOVADECK_DATABASE="${join(directory, "workspace.sqlite").replaceAll("\\", "/")}"`,
      process.platform === "win32" ? "COMSPEC=cmd.exe" : "SHELL=/bin/sh",
    ].join("\n"),
  )
  return directory
}

const attach = async (client: RuntimeClient, terminalId: string, resources: Resources) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error("CLI terminal timed out")), 10_000)
  timeout.unref()
  resources.defer(() => {
    clearTimeout(timeout)
    controller.abort()
  })
  const stream = await client.terminals.attach({ terminalId }, { signal: controller.signal })
  let output = ""
  const next = async () => {
    const result = await stream.next()
    if (result.done) throw new Error("CLI terminal ended before the expected event")
    const event = result.value
    if (event.type === "snapshot") output = event.data
    if (event.type === "output") output += event.data
    await client.terminals.ack({ terminalId, sequence: event.sequence })
    return event
  }
  const untilOutput = async (pattern: RegExp) => {
    while (!pattern.test(output)) {
      // eslint-disable-next-line no-await-in-loop -- Read ordered events until the shell's output checkpoint.
      await next()
    }
    return output
  }
  return { next, untilOutput, output: () => output }
}

describe("built runtime CLI", () => {
  it("environment, authentication, shell I/O and metadata persistence after restart", async ({
    resources,
  }) => {
    const directory = await directoryFixture(resources)
    await writeFile(
      join(directory, "check.mjs"),
      [
        'import { strict as assert } from "node:assert"',
        "assert.equal(process.env.NOVADECK_TOKEN, undefined)",
        "assert.equal(process.stdin.isTTY, true)",
        "assert.equal(process.stdout.isTTY, true)",
        `assert.equal(process.cwd(), ${JSON.stringify(directory)})`,
        'console.log("CLI_" + "SHELL_OK")',
      ].join("\n"),
    )
    const runtime = await launchCli(directory, resources)
    expect(
      (await fetch(`${runtime.origin}/api/status`, { signal: AbortSignal.timeout(10_000) })).status,
    ).toBe(200)
    expect((await stat(join(directory, "workspace.sqlite"))).isFile()).toBe(true)
    expect(runtime.output()).not.toContain(token)
    const client = await runtime.connect()
    const call = { signal: AbortSignal.timeout(10_000) }
    await expect(client.projects.list(undefined, call)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
    await expect(
      client.runtime.handshake({ protocolVersion, token: "wrong" }, call),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    const info = await client.runtime.handshake({ protocolVersion, token }, call)
    const project = await client.projects.create({ name: "CLI workspace", cwd: directory }, call)
    const session = await client.sessions.create(
      { projectId: project.id, name: "CLI session" },
      call,
    )
    const terminal = await client.terminals.create(
      { sessionId: session.id, cols: 80, rows: 24 },
      call,
    )
    const reader = await attach(client, terminal.id, resources)
    const command =
      process.platform === "win32"
        ? `"${process.execPath}" "${join(directory, "check.mjs")}"\r`
        : `'${process.execPath.replaceAll("'", "'\\''")}' '${join(directory, "check.mjs").replaceAll("'", "'\\''")}'\r`
    await client.terminals.write({ terminalId: terminal.id, data: command }, call)
    await reader.untilOutput(/CLI_SHELL_OK/)
    await client.terminals.write({ terminalId: terminal.id, data: "exit 7\r" }, call)
    let event = await reader.next()
    while (event.type !== "exited") {
      // eslint-disable-next-line no-await-in-loop -- The exit follows the shell's remaining output.
      event = await reader.next()
    }
    expect(event.exitCode).toBe(7)
    expect(reader.output()).not.toContain(token)
    const stopped = await runtime.stop()
    if (process.platform !== "win32") expect(stopped).toEqual({ code: 0, signal: null })

    const restarted = await launchCli(directory, resources)
    const connection = await restarted.connect()
    const restartCall = { signal: AbortSignal.timeout(10_000) }
    const restart = await connection.runtime.handshake({ protocolVersion, token }, restartCall)
    expect(restart.runtimeId).not.toBe(info.runtimeId)
    await expect(connection.projects.list(undefined, restartCall)).resolves.toEqual([project])
    await expect(connection.sessions.list({ projectId: project.id }, restartCall)).resolves.toEqual(
      [session],
    )
    await expect(
      connection.terminals.list({ sessionId: session.id }, restartCall),
    ).resolves.toEqual([])
  }, 30_000)

  it.skipIf(process.platform === "win32")(
    "POSIX SIGTERM shutdown exits cleanly and terminates the owned shell",
    async ({ resources }) => {
      const directory = await directoryFixture(resources)
      const runtime = await launchCli(directory, resources)
      const client = await runtime.connect()
      const call = { signal: AbortSignal.timeout(10_000) }
      await client.runtime.handshake({ protocolVersion, token }, call)
      const project = await client.projects.create({ name: "Shutdown", cwd: directory }, call)
      const session = await client.sessions.create(
        { projectId: project.id, name: "Live shell" },
        call,
      )
      const terminal = await client.terminals.create(
        { sessionId: session.id, cols: 80, rows: 24 },
        call,
      )
      const reader = await attach(client, terminal.id, resources)
      await client.terminals.write(
        { terminalId: terminal.id, data: "printf 'OWNED_%s_PID=%s\\n' SHELL \"$$\"\r" },
        call,
      )
      const output = await reader.untilOutput(/OWNED_SHELL_PID=\d+/)
      const pid = Number(/OWNED_SHELL_PID=(\d+)/.exec(output)?.[1])
      expect(pid).toBeGreaterThan(0)
      expect(() => process.kill(pid, 0)).not.toThrow()
      expect(await runtime.stop()).toEqual({ code: 0, signal: null })
      expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }))
    },
    20_000,
  )
})
