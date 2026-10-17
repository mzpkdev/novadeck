import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { ServerResponse } from "node:http"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

import { box } from "@novadeck/harness-agy/box"
import type { Report } from "@novadeck/harness-core/report"
import type { TranscriptItem } from "@novadeck/protocol"
import type { Terminal as Screen } from "@xterm/headless"

import type { Binding } from "../../harnesses/bindings.js"
import type { Delivery } from "../../messaging/delivery.js"
import type { HookAnswer } from "../../shell/reports.js"
import { screenText } from "../../terminals/screen.js"
import { agy } from "../agents/agy.js"
import { describe, e2e, expect, supported } from "../fixture.js"
import { installHarness, pins } from "../install.js"
import { asked, gate } from "../model/script.js"
import { own, replies, start } from "../scenarios.js"

// Forensic opt-in only. The natural control keeps the original ungated order.
// Staged phases deliberately pre-paste Then while Five's model reply is held and
// shorten its paste-to-Enter delay; they are scheduling experiments, not reproductions.
const enabled = process.env.AGY_CAPTURE === "1" && process.env.NOVADECK_E2E_PROBES === "1"
type Process = {
  pid: number
  write: (data: string) => void
  onData: (listen: (data: string) => void) => { dispose: () => void }
}
type Record = { process: Process; screen: Screen; binding: Binding | null; chain: Promise<void> }
type Frame = {
  sourceMs: number
  changed: boolean
  observedMs: number
  rows: readonly string[]
  generating: boolean
  didFive: boolean
  queued: boolean
  input: string | undefined
}
type Inside = {
  records: Map<string, Record>
  report: (report: Report, deadline?: number) => Promise<HookAnswer>
  messaging: { delivery: (id: string) => Delivery | undefined }
}

describe.skipIf(!enabled || !supported)("Antigravity natural Stop boundary capture", () => {
  const it = e2e(agy)
  it("preserves the original back-to-back prompt order", async ({ e2e: run }) => {
    expect(pins.agy?.version).toBe("1.2.14")
    const phase = process.env.AGY_CAPTURE_PHASE ?? "natural"
    expect(["natural", "stop-return", "busy-frame", "clear-frame"]).toContain(phase)
    const folder = process.env.AGY_CAPTURE_OUT!
    mkdirSync(folder, { recursive: true })
    const zero = performance.now()
    const secrets = new Set([run.model.credential])
    const serialize = (value: unknown, pretty = false) => {
      let text = JSON.stringify(value, null, pretty ? 2 : undefined)
      for (const secret of secrets) text = text.replaceAll(secret, "<redacted-capture-token>")
      return text
    }
    const save = (name: string, value: unknown) =>
      writeFileSync(join(folder, name), serialize(value, true))
    // No disk I/O on the timing boundary; bounded buffers flush before teardown.
    const events: object[] = []
    const output: object[] = []
    let eventOverflow = false
    let outputOverflow = false
    let bytes = 0
    const record = (type: string, extra: object = {}) => {
      if (events.length < 5_000)
        events.push({ at: Date.now(), ms: performance.now() - zero, type, ...extra })
      else eventOverflow = true
    }
    const binding = (id: string) => {
      const found = inside.records.get(id)?.binding
      return found && { agent: found.agent, sessionId: found.sessionId, instance: found.instance }
    }
    const delivery = (id: string) => {
      const found = inside.messaging.delivery(id)
      if (!found) return undefined
      const input = found.box
      return {
        state: found.state,
        epoch: found.epoch,
        byPerson: found.byPerson,
        phase: found.state === "working" ? found.phase : undefined,
        box: {
          empty: input.empty,
          queuing: input.queuing,
          queuingSince: input.queuingSince,
          enteredAt: input.enteredAt,
          typedAt: input.typedAt,
          escapedAt: input.escapedAt,
          typedSinceEnter: input.typedSinceEnter,
          strayed: input.strayed,
          queued: input.queued,
          draftWhileAsked: input.draftWhileAsked,
          doubted: input.doubted,
        },
      }
    }
    const releaseFive = gate()
    const boundaryDone = gate()
    let fiveResponse: number | undefined
    let fiveFinishedMs: number | undefined
    let fiveInvocationSeq: number | undefined
    let lastInvocationSeq: number | undefined
    let stopMs: number | undefined
    let stopReturned = false
    let armed = false
    let targetId: string | undefined
    let targetBinding: Binding | undefined
    let targetProcess: Process | undefined
    let lastFrame: Frame | undefined
    let boundary: { valid: boolean; reason: string } | undefined
    let boundaryError: Error | undefined
    let trigger: ((frame: Frame | undefined) => void) | undefined
    const installed = await installHarness("agy")
    expect(installed.version).toBe("1.2.14")
    const binary = join(installed.bin, "agy")
    save("identity.json", {
      scenario: phase === "natural" ? "original-natural-order" : "staged-stop-boundary",
      phase,
      version: installed.version,
      binarySha256: createHash("sha256").update(readFileSync(binary)).digest("hex"),
      node: process.version,
    })
    run.model.use(
      (call) => {
        if (!call.side && asked(call, "Five\nlines\nof\nit\nhere"))
          fiveInvocationSeq = lastInvocationSeq
        record("model.call.decoded", {
          api: call.api,
          model: call.model,
          side: call.side,
          turns: call.turns,
        })
        return undefined
      },
      replies("First quick", "Did first."),
      replies("Second quick", "Did second."),
      own((call) =>
        agy.steers && asked(call, "Third one") && asked(call, "Fourth one")
          ? { text: "Did third. Did fourth." }
          : undefined,
      ),
      replies("Third one", "Did third."),
      replies("Fourth one", "Did fourth."),
      own(async (call) => {
        if (!asked(call, "Five\nlines\nof\nit\nhere")) return undefined
        if (phase !== "natural") await releaseFive.opened
        return { text: "Did five." }
      }),
      replies("Then one", "Did then."),
    )
    const responses = new WeakMap<ServerResponse, number>()
    let nextResponse = 0
    const write = ServerResponse.prototype.write
    const end = ServerResponse.prototype.end
    ServerResponse.prototype.write = function (...args: unknown[]) {
      const chunk = String(args[0])
      if (chunk.includes('"candidates":')) {
        if (!responses.has(this)) {
          const id = ++nextResponse
          responses.set(this, id)
          this.once("finish", () => {
            if (id === fiveResponse) fiveFinishedMs = performance.now() - zero
            record("model.http.finish", { id })
          })
          this.once("close", () => record("model.http.close", { id }))
        }
        if (chunk.includes('"text":"Did five."')) fiveResponse = responses.get(this)
        record("model.http.write", { id: responses.get(this), chunk })
      }
      return Reflect.apply(write, this, args) as boolean
    }
    ServerResponse.prototype.end = function (...args: unknown[]) {
      if (responses.has(this)) record("model.http.end.called", { id: responses.get(this) })
      const result = Reflect.apply(end, this, args) as ServerResponse
      if (responses.has(this)) record("model.http.end.returned", { id: responses.get(this) })
      return result
    }
    const inside = run.deck.terminals as unknown as Inside
    const report = inside.report
    inside.report = async function (incoming, deadline) {
      secrets.add(incoming.token)
      if (incoming.event === "PreInvocation") lastInvocationSeq = incoming.seq
      const target =
        armed &&
        incoming.terminalId === targetId &&
        incoming.agent === "agy" &&
        incoming.event === "Stop" &&
        fiveFinishedMs !== undefined &&
        fiveInvocationSeq !== undefined &&
        incoming.seq > fiveInvocationSeq &&
        incoming.instance === targetBinding?.instance &&
        incoming.payload.conversationId === targetBinding?.sessionId
      if (target) {
        stopMs = performance.now() - zero
        armed = false
      }
      record("hook.received", {
        agent: incoming.agent,
        event: incoming.event,
        instance: incoming.instance,
        seq: incoming.seq,
        firedAt: incoming.firedAt,
      })
      const answer = await report.call(this, incoming, deadline)
      record("hook.response", {
        agent: incoming.agent,
        event: incoming.event,
        stdout: answer.stdout,
        binding: binding(incoming.terminalId),
        delivery: delivery(incoming.terminalId),
      })
      if (target) {
        stopReturned = true
        record("boundary.stop-return", { stopMs, fiveFinishedMs })
        if (phase === "stop-return") trigger?.(lastFrame)
      }
      return answer
    }
    let child: Process | undefined
    let original: Process["write"] | undefined
    let native: { dispose: () => void } | undefined
    const nativeFrames = new Set<Promise<void>>()
    let outcome = "scenario-error"
    let stage = "startup"
    let final: { queued: boolean; generating: boolean } | undefined
    let thenEntered = false
    let thenPasted = false
    try {
      const terminal = await start(run, agy)
      child = inside.records.get(terminal.id)!.process
      original = child.write
      const live = inside.records.get(terminal.id)!
      const frame = (sourceMs: number): Frame => {
        const shown = screenText(live.screen)
        return {
          sourceMs,
          changed: false,
          observedMs: performance.now() - zero,
          rows: shown.rows,
          generating: shown.rows.some((row) => row.includes("Generating")),
          didFive: shown.rows.some((row) => row.includes("Did five.")),
          queued: Boolean(box.queued(shown)),
          input: box.read(shown)?.text,
        }
      }
      const finishBoundary = (valid: boolean, reason: string) => {
        if (boundary) return
        boundary = { valid, reason }
        record("boundary.result", { phase, ...boundary })
        boundaryDone.open()
      }
      trigger = (observed) => {
        if (boundary || !stopReturned) return
        const current = {
          ...frame(observed?.sourceMs ?? Number.NEGATIVE_INFINITY),
          changed: observed?.changed ?? false,
        }
        const same =
          live.process === targetProcess &&
          live.binding?.agent === targetBinding?.agent &&
          live.binding?.instance === targetBinding?.instance &&
          live.binding?.sessionId === targetBinding?.sessionId
        const postStop = stopMs !== undefined && current.sourceMs >= stopMs
        record("boundary.precondition", {
          phase,
          sameBindingAndProcess: same,
          fiveFinishedMs,
          stopMs,
          lastFrameAgeMs: current.observedMs - current.sourceMs,
          postStopFrame: postStop,
          frame: current,
        })
        if (
          !same ||
          fiveFinishedMs === undefined ||
          current.input?.trim() !== "Then one" ||
          current.queued
        ) {
          finishBoundary(false, "binding-input-or-finalization-precondition-missed")
          return
        }
        const needsBusy = phase !== "clear-frame"
        if (phase !== "stop-return" && (!postStop || !current.changed)) return
        if (phase === "busy-frame" && !current.didFive) return
        if (phase === "clear-frame" && (!current.didFive || current.generating)) return
        if (needsBusy && !current.generating) {
          finishBoundary(false, "generating-not-observed-at-trigger")
          return
        }
        // A single deliberate terminal Enter, after an independently verified paste.
        // Its native write-return is an API ACK, not proof of kernel consumption.
        try {
          run.deck.terminals.write({ terminalId: terminal.id, data: "\r" }, "e2e")
          finishBoundary(true, "single-enter-written")
        } catch (error) {
          boundaryError = new Error("The staged Enter write failed", { cause: error })
          record("boundary.input-write.failed", { error: String(error) })
          finishBoundary(false, "enter-write-failed")
        }
      }
      const state = () => ({
        binding: binding(terminal.id),
        delivery: delivery(terminal.id),
        activity: terminal.summary().activity?.state,
      })
      child.write = function (data) {
        record("pty.input", { data, ...state() })
        const result = original!.call(this, data)
        record("pty.input.returned", { data })
        if (data.includes("Then one")) thenPasted = true
        if (thenPasted && data === "\r") thenEntered = true
        return result
      }
      native = child.onData((data) => {
        const sourceMs = performance.now() - zero
        // The manager batches native chunks before drawing. Observe its existing draw
        // completion; adding an xterm write here could run before that queued draw.
        const rendered = live.chain
          .then(() => {
            const current = frame(sourceMs)
            current.changed = JSON.stringify(current.rows) !== JSON.stringify(lastFrame?.rows)
            lastFrame = current
            record("native.frame", current)
            if (phase === "busy-frame" || phase === "clear-frame") trigger?.(current)
          })
          .catch((error: unknown) => {
            record("native.frame.error", { error: String(error) })
            finishBoundary(false, "native-frame-observation-error")
          })
        nativeFrames.add(rendered)
        void rendered.finally(() => nativeFrames.delete(rendered))
        bytes += Buffer.byteLength(data)
        if (bytes <= 8 * 1024 * 1024 && output.length < 8_192)
          output.push({ at: Date.now(), ms: performance.now() - zero, data })
        else outputOverflow = true
      })
      const capture = async (name: string) => {
        const screen = await terminal.screenText()
        if (name === "final")
          final = {
            queued: Boolean(screen && box.queued(screen)),
            generating: Boolean(screen?.rows.some((row) => row.includes("Generating"))),
          }
        save(`${name}.json`, {
          at: Date.now(),
          ms: performance.now() - zero,
          ...state(),
          screen,
          input: screen && box.read(screen),
          queued: screen && box.queued(screen),
        })
        try {
          save(
            `${name}-transcript.json`,
            (await terminal.transcript())
              .filter((one) => one.kind === "text")
              .map((one) => ({ index: one.index, role: one.role, kind: one.kind, text: one.text })),
          )
        } catch (error) {
          record("transcript.error", { error: String(error) })
        }
      }
      const texts = async (role: TranscriptItem["role"]) =>
        (await terminal.transcript())
          .filter((one) => one.role === role && one.kind === "text")
          .map((one) => one.text)
      const item = (needle: string) =>
        terminal.poll(
          async () => {
            try {
              return (await texts("assistant")).find((text) => text.includes(needle))
            } catch (error) {
              if ((error as { code?: string }).code === "NOT_FOUND") return undefined
              throw error
            }
          },
          `its transcript to hold ${needle}`,
          30_000,
        )
      await capture("initial")
      record("scenario.begin")
      try {
        stage = "first-second"
        await terminal.prompt("First quick")
        await terminal.prompt("Second quick")
        await item("Did second.")
        stage = "third-fourth"
        await Promise.all([terminal.prompt("Third one"), terminal.prompt("Fourth one")])
        await item("Did fourth.")
        stage = "five-then"
        await terminal.prompt("Five\nlines\nof\nit\nhere")
        if (phase === "natural") await terminal.prompt("Then one")
        else {
          await run.model.waitFor((call) => !call.side && asked(call, "Five\nlines\nof\nit\nhere"))
          run.deck.terminals.write(
            { terminalId: terminal.id, data: "\x1b[200~Then one\x1b[201~" },
            "e2e",
          )
          const until = Date.now() + 5_000
          let previous: string | undefined
          let landed = false
          while (Date.now() < until) {
            // eslint-disable-next-line no-await-in-loop -- Confirm two sequential real-screen reads before release.
            await sleep(50)
            // eslint-disable-next-line no-await-in-loop -- The second read must follow the first.
            const shown = await terminal.screenText()
            const input = shown && box.read(shown)
            const key =
              input?.mode === "prompt" && input.text.trim() === "Then one"
                ? `${input.first}:${input.last}:${input.text}`
                : undefined
            if (key !== undefined && key === previous) {
              landed = true
              break
            }
            previous = key
          }
          const found = live.binding
          if (!landed || !found || found.agent !== "agy" || found.instance === null) {
            finishBoundary(false, "paste-or-live-binding-not-confirmed")
          } else {
            targetId = terminal.id
            targetBinding = { ...found }
            targetProcess = live.process
            armed = true
            record("boundary.model-release", {
              phase,
              binding: binding(terminal.id),
              frame: frame(lastFrame?.sourceMs ?? 0),
            })
            releaseFive.open()
            const timeout = new AbortController()
            try {
              await Promise.race([
                boundaryDone.opened,
                sleep(5_000, undefined, { signal: timeout.signal }).then(() =>
                  finishBoundary(false, "trigger-frame-not-observed"),
                ),
              ])
            } finally {
              timeout.abort()
            }
          }
          if (boundaryError) throw boundaryError
          if (!boundary?.valid) {
            outcome = "invalid-precondition"
            return
          }
        }
        stage = "reply-waits"
        for (const reply of ["Did first.", "Did second.", "Did third.", "Did fourth.", "Did then."])
          // eslint-disable-next-line no-await-in-loop -- Preserve the original reply waits in order.
          await item(reply)
        stage = "exact-once"
        const users = await texts("user")
        for (const sent of [
          "First quick",
          "Second quick",
          "Third one",
          "Fourth one",
          "Five\nlines\nof\nit\nhere",
          "Then one",
        ])
          expect(
            users.filter((text) => (agy.steers ? text.includes(sent) : text === sent)),
          ).toHaveLength(1)
        outcome = "delivered"
      } catch (error) {
        const received = run.model.calls.some((call) => !call.side && asked(call, "Then one"))
        outcome =
          thenEntered && !received ? "submitted-followup-never-reached-model" : "scenario-error"
        record("scenario.failure", { outcome, stage, error: String(error) })
        throw error
      } finally {
        await capture("final")
        save("history.json", terminal.history())
      }
    } finally {
      releaseFive.open()
      trigger = undefined
      if (child && original) child.write = original
      native?.dispose()
      delete (inside as Partial<Inside>).report
      ServerResponse.prototype.write = write
      ServerResponse.prototype.end = end
      await Promise.all(nativeFrames)
      save("summary.json", {
        outcome,
        phase,
        boundary,
        stage,
        final,
        thenPasted,
        thenEntered,
        eventOverflow,
        outputOverflow,
      })
      writeFileSync(
        join(folder, "events.jsonl"),
        events.map((one) => serialize(one)).join("\n") + "\n",
      )
      writeFileSync(
        join(folder, "native-output.jsonl"),
        output.map((one) => serialize(one)).join("\n") + "\n",
      )
    }
  })
})
