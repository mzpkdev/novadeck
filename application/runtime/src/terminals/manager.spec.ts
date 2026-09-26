import type { TerminalEvent } from "@novadeck/protocol"
import headless from "@xterm/headless"
import { afterEach } from "vitest"

import { context, describe, expect, it } from "../test.js"
import { TerminalManager } from "./manager.js"

const managers: TerminalManager[] = []
const streams: AsyncGenerator<TerminalEvent>[] = []
const cwd = process.cwd()
const { Terminal } = headless

const manager = (
  options: ConstructorParameters<typeof TerminalManager>[0] = {},
): TerminalManager => {
  const result = new TerminalManager({ shell: "/bin/sh", env: { PS1: "" }, ...options })
  managers.push(result)
  return result
}

const attach = (
  runtime: TerminalManager,
  id: string,
  owner: string,
  afterSequence?: number,
  mode: "control" | "observe" = "control",
) => {
  const stream = runtime.attach(
    { terminalId: id, mode, ...(afterSequence === undefined ? {} : { afterSequence }) },
    owner,
  )
  streams.push(stream)
  return stream
}

const until = async (
  runtime: TerminalManager,
  stream: AsyncGenerator<TerminalEvent>,
  owner: string,
  predicate: (event: TerminalEvent) => boolean,
): Promise<TerminalEvent[]> => {
  const events: TerminalEvent[] = []
  for await (const event of stream) {
    events.push(event)
    runtime.ack({ terminalId: event.terminalId, sequence: event.sequence }, owner)
    if (predicate(event)) return events
  }
  throw new Error("Terminal ended before the expected event.")
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((runtime) => runtime.shutdown()))
  await Promise.all(streams.splice(0).map((stream) => stream.return(undefined)))
})

describe.skipIf(process.platform === "win32")("terminal manager", () => {
  context("a real shell keeps running between attachments", () => {
    it("restores a parsed screen and replays ordered events after a cursor", async () => {
      const runtime = manager()
      const terminal = await runtime.create(
        { sessionId: "session", cwd, cols: 80, rows: 24 },
        "first",
      )
      const first = attach(runtime, terminal.id, "first")
      const initial = await first.next()
      expect(initial.value).toMatchObject({ type: "snapshot", sequence: 0, status: "running" })
      runtime.ack({ terminalId: terminal.id, sequence: initial.value!.sequence }, "first")
      runtime.write(
        { terminalId: terminal.id, data: "printf '\\033[31mCOLOR\\033[0m\\n'\n" },
        "first",
      )
      const events = await until(
        runtime,
        first,
        "first",
        (event) => event.type === "output" && event.data.includes("\u001b[31mCOLOR"),
      )
      const cursor = events.at(-1)!.sequence
      expect(
        events.every(
          (event, index) => index === 0 || event.sequence === events[index - 1]!.sequence + 1,
        ),
      ).toBe(true)

      const observer = attach(runtime, terminal.id, "observer", undefined, "observe")
      const snapshot = (await observer.next()).value!
      expect(snapshot.type).toBe("snapshot")
      if (snapshot.type !== "snapshot") throw new Error("Expected snapshot")
      const restored = new Terminal({
        cols: snapshot.cols,
        rows: snapshot.rows,
        allowProposedApi: true,
      })
      try {
        await new Promise<void>((resolve) => restored.write(snapshot.data, resolve))
        const content = Array.from({ length: restored.buffer.active.length }, (_, index) =>
          restored.buffer.active.getLine(index)?.translateToString(),
        ).join("\n")
        expect(content).toContain("COLOR")
      } finally {
        restored.dispose()
      }
      await observer.return(undefined)

      // until() closes its iterator and releases control; reclaim it independently.
      const continuation = attach(runtime, terminal.id, "second", cursor)
      const pending = continuation.next()
      // Attachment registration occurs asynchronously before accepting writes.
      await Promise.resolve()
      runtime.resize({ terminalId: terminal.id, cols: 100, rows: 30 }, "second")
      const resized = (await pending).value!
      expect(resized).toMatchObject({ type: "resized", sequence: cursor + 1, cols: 100, rows: 30 })
      runtime.ack({ terminalId: terminal.id, sequence: resized.sequence }, "second")
      await continuation.return(undefined)
      const replay = attach(runtime, terminal.id, "third", cursor)
      expect((await replay.next()).value).toEqual(resized)
      expect(runtime.get(terminal.id).status).toBe("running")
    })
  })

  it("releases control on cancellation and denies observers input, resize, and close", async () => {
    const runtime = manager()
    const terminal = await runtime.create(
      { sessionId: "session", cwd, cols: 80, rows: 24 },
      "controller",
    )
    const signal = new AbortController()
    const controller = runtime.attach({ terminalId: terminal.id }, "controller", signal.signal)
    streams.push(controller)
    await controller.next()
    const observer = attach(runtime, terminal.id, "observer", undefined, "observe")
    await observer.next()
    expect(() => runtime.write({ terminalId: terminal.id, data: "input" }, "observer")).toThrow(
      expect.objectContaining({ code: "CONTROL_REQUIRED" }),
    )
    expect(() =>
      runtime.resize({ terminalId: terminal.id, cols: 40, rows: 10 }, "observer"),
    ).toThrow(expect.objectContaining({ code: "CONTROL_REQUIRED" }))
    await expect(runtime.close({ terminalId: terminal.id }, "observer")).rejects.toMatchObject({
      code: "CONTROL_REQUIRED",
    })
    const pending = controller.next()
    signal.abort()
    expect((await pending).done).toBe(true)
    const replacement = attach(runtime, terminal.id, "replacement")
    expect((await replacement.next()).value).toMatchObject({ type: "snapshot", status: "running" })
    expect(runtime.get(terminal.id).status).toBe("running")
  })

  it("emits natural exit after parsed output and evicts exited records at capacity", async () => {
    const runtime = manager({ shellArgs: ["-c", "printf 'FINAL\\n'; exit 7"], maxTerminals: 1 })
    const terminal = await runtime.create(
      { sessionId: "session", cwd, cols: 80, rows: 24 },
      "owner",
    )
    const stream = attach(runtime, terminal.id, "owner")
    const events = await until(runtime, stream, "owner", (event) => event.type === "exited")
    expect(events.at(-1)).toMatchObject({ type: "exited", exitCode: 7 })
    expect(
      events
        .slice(0, -1)
        .some(
          (event) =>
            (event.type === "output" || event.type === "snapshot") && event.data.includes("FINAL"),
        ),
    ).toBe(true)
    const next = await runtime.create({ sessionId: "session", cwd, cols: 80, rows: 24 }, "owner")
    expect(next.id).not.toBe(terminal.id)
    expect(() => runtime.get(terminal.id)).toThrow(
      expect.objectContaining({ code: "TERMINAL_NOT_FOUND" }),
    )
  })

  it("uses a snapshot when retained history no longer covers the cursor", async () => {
    const runtime = manager({ historyBytes: 1 })
    const terminal = await runtime.create(
      { sessionId: "session", cwd, cols: 80, rows: 24 },
      "owner",
    )
    const first = attach(runtime, terminal.id, "owner")
    await first.next()
    runtime.write({ terminalId: terminal.id, data: "printf 'HISTORY\\n'\n" }, "owner")
    await until(
      runtime,
      first,
      "owner",
      (event) => event.type === "output" && event.data.includes("HISTORY\r\n"),
    )
    const reconnect = attach(runtime, terminal.id, "other", 0)
    expect((await reconnect.next()).value).toMatchObject({
      type: "snapshot",
      data: expect.stringContaining("HISTORY"),
    })
  })

  it("fails a slow subscription while preserving its shell", async () => {
    const runtime = manager({ subscriberBytes: 1024, ackWindowBytes: 256 })
    const terminal = await runtime.create(
      { sessionId: "session", cwd, cols: 80, rows: 24 },
      "owner",
    )
    const stream = attach(runtime, terminal.id, "owner")
    const snapshot = (await stream.next()).value!
    runtime.ack({ terminalId: terminal.id, sequence: snapshot.sequence }, "owner")
    // Resize events pass through the same queue and force the bounded queue to overflow.
    for (let index = 0; index < 20; index += 1)
      runtime.resize({ terminalId: terminal.id, cols: 80 + index, rows: 24 }, "owner")
    const barrier = attach(runtime, terminal.id, "barrier", undefined, "observe")
    await barrier.next()
    await barrier.return(undefined)
    await expect(stream.next()).rejects.toMatchObject({ code: "SLOW_CONSUMER" })
    expect(runtime.get(terminal.id).status).toBe("running")
    const replacement = attach(runtime, terminal.id, "replacement")
    expect((await replacement.next()).value).toMatchObject({ type: "snapshot", status: "running" })
  })

  it("reports an undersized snapshot allowance without retaining control or killing the shell", async () => {
    const runtime = manager({ snapshotBytes: 1 })
    const terminal = await runtime.create(
      { sessionId: "session", cwd, cols: 80, rows: 24 },
      "owner",
    )
    const stream = attach(runtime, terminal.id, "owner")
    await expect(stream.next()).rejects.toMatchObject({ code: "SNAPSHOT_TOO_LARGE" })
    expect(() => runtime.write({ terminalId: terminal.id, data: "" }, "owner")).toThrow(
      expect.objectContaining({ code: "CONTROL_REQUIRED" }),
    )
    expect(runtime.get(terminal.id).status).toBe("running")
  })

  it("returns clean creation errors without consuming terminal capacity", async () => {
    const runtime = manager({ maxTerminals: 1 })
    await expect(
      runtime.create(
        { sessionId: "session", cwd: "/novadeck/missing/directory", cols: 80, rows: 24 },
        "owner",
      ),
    ).rejects.toMatchObject({ code: "INVALID_DIRECTORY" })
    expect(runtime.list()).toEqual([])
    await runtime.create({ sessionId: "session", cwd, cols: 80, rows: 24 }, "owner")
    await expect(
      runtime.create({ sessionId: "session", cwd, cols: 80, rows: 24 }, "owner"),
    ).rejects.toMatchObject({ code: "RESOURCE_LIMIT" })
    const invalid = manager({ shell: "/novadeck/missing/shell" })
    await expect(
      invalid.create({ sessionId: "session", cwd, cols: 80, rows: 24 }, "owner"),
    ).rejects.toMatchObject({ code: "SPAWN_FAILED" })
    expect(invalid.list()).toEqual([])
  })

  it("rejects duplicate attachments without releasing the current controller", async () => {
    const runtime = manager()
    const terminal = await runtime.create(
      { sessionId: "session", cwd, cols: 80, rows: 24 },
      "owner",
    )
    const current = attach(runtime, terminal.id, "owner")
    await current.next()
    const duplicate = attach(runtime, terminal.id, "owner")
    await expect(duplicate.next()).rejects.toMatchObject({ code: "ALREADY_ATTACHED" })
    expect(() => runtime.write({ terminalId: terminal.id, data: "" }, "owner")).not.toThrow()
    const competing = attach(runtime, terminal.id, "other")
    await expect(competing.next()).rejects.toMatchObject({ code: "CONTROL_IN_USE" })
  })

  it("never reacquires control after a disconnected or pre-cancelled attachment", async () => {
    const runtime = manager()
    const terminal = await runtime.create(
      { sessionId: "session", cwd, cols: 80, rows: 24 },
      "owner",
    )
    const pending = attach(runtime, terminal.id, "owner").next()
    runtime.release("owner")
    expect((await pending).done).toBe(true)
    const replacement = attach(runtime, terminal.id, "replacement")
    await replacement.next()
    await replacement.return(undefined)
    const signal = new AbortController()
    signal.abort()
    const cancelled = runtime.attach({ terminalId: terminal.id }, "cancelled", signal.signal)
    expect((await cancelled.next()).done).toBe(true)
    const control = attach(runtime, terminal.id, "final")
    expect((await control.next()).value).toMatchObject({ type: "snapshot", status: "running" })
  })

  it("drains a large final output before reporting exit", async () => {
    const runtime = manager({ shellArgs: ["-c", "printf '%1048576s' X; printf END; exit 4"] })
    const terminal = await runtime.create(
      { sessionId: "session", cwd, cols: 80, rows: 24 },
      "owner",
    )
    const stream = attach(runtime, terminal.id, "owner")
    const events = await until(runtime, stream, "owner", (event) => event.type === "exited")
    const output = events
      .filter((event) => event.type === "output")
      .map((event) => event.data)
      .join("")
    expect(output).toHaveLength(1048579)
    expect(output.endsWith("XEND")).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: "exited", exitCode: 4 })
  })

  it("closes shells that ignore SIGHUP and kills live PTYs during shutdown", async () => {
    const runtime = manager({ shellArgs: ["-c", "trap '' HUP; printf 'PID=%s\\n' $$; exec cat"] })
    const terminal = await runtime.create(
      { sessionId: "session", cwd, cols: 80, rows: 24 },
      "owner",
    )
    const stream = attach(runtime, terminal.id, "owner")
    const events = await until(
      runtime,
      stream,
      "owner",
      (event) =>
        (event.type === "output" || event.type === "snapshot") && /PID=\d+/.test(event.data),
    )
    const data = events.map((event) => ("data" in event ? event.data : "")).join("")
    const pid = Number(/PID=(\d+)/.exec(data)![1])
    const control = attach(runtime, terminal.id, "control")
    await control.next()
    await runtime.close({ terminalId: terminal.id }, "control")
    expect(runtime.get(terminal.id)).toMatchObject({ status: "exited", exitCode: null })
    expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }))
    const second = await runtime.create({ sessionId: "session", cwd, cols: 80, rows: 24 }, "owner")
    const secondStream = attach(runtime, second.id, "owner")
    const secondEvents = await until(
      runtime,
      secondStream,
      "owner",
      (event) =>
        (event.type === "output" || event.type === "snapshot") && /PID=\d+/.test(event.data),
    )
    const secondPid = Number(
      /PID=(\d+)/.exec(
        secondEvents.map((event) => ("data" in event ? event.data : "")).join(""),
      )![1],
    )
    await runtime.shutdown()
    expect(() => process.kill(secondPid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }))
    await expect(
      runtime.create({ sessionId: "session", cwd, cols: 80, rows: 24 }, "owner"),
    ).rejects.toMatchObject({ code: "RUNTIME_CLOSING" })
  })
})
