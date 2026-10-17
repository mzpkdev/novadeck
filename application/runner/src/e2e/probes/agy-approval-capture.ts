import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import type { Report } from "@novadeck/harness-core/report"
import type { Terminal as Screen } from "@xterm/headless"

import {
  approvalSenderMatches,
  observationPairs,
  payloadMetadata,
  watchApprovalIngress,
} from "../../../../../scripts/flaky-capture/agy-approval-events.ts"
import type { Activity } from "../../harnesses/activity.js"
import type { Binding } from "../../harnesses/bindings.js"
import { requestRef } from "../../harnesses/detail.js"
import { harnesses } from "../../harnesses/registry.js"
import type { HookAnswer } from "../../shell/reports.js"
import { screenText } from "../../terminals/screen.js"
import type { DeckTerminal } from "../deck.js"
import type { E2E } from "../fixture.js"
import { installHarness } from "../install.js"

type Process = {
  pid: number
  write: (data: string) => void
  onData: (listen: (data: string) => void) => { dispose: () => void }
}
type Record = {
  token: string
  process: Process
  screen: Screen
  chain: Promise<void>
  binding: Binding | null
  activity: Activity | null
  exitQueued: boolean
  agents: { readonly agy?: { readonly seq: number } }
}
type Inside = {
  records: Map<string, Record>
  report: (report: Report, deadline?: number) => Promise<HookAnswer>
}
const hooks = new Set(["StatusLine", "PreInvocation", "PreToolUse", "PostToolUse", "Stop"])
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const safeId = (value: string) => (/^[\w:-]{1,160}$/.test(value) ? value : `sha256:${hash(value)}`)

/** Loaded only by the opt-in transform around the original approval case. */
export const startApprovalCapture = async (run: E2E) => {
  if (process.env.NOVADECK_AGY_APPROVAL_CAPTURE !== "1")
    throw new Error("AGY approval capture is opt-in")
  const folder = process.env.NOVADECK_AGY_APPROVAL_OUTPUT!
  if (!folder) throw new Error("Missing AGY approval artifact directory")
  mkdirSync(folder, { recursive: true })
  const zero = performance.now()
  const events: object[] = []
  const output: object[] = []
  const secrets = new Set([run.model.credential])
  let overflow = false
  let nativeOverflow = false
  let nativeBytes = 0
  let eventBytes = 0
  let frameCount = 0
  let frameErrors = 0
  let stage = "in-case"
  let failed: string | undefined
  let terminal: DeckTerminal | undefined
  let live: Record | undefined
  let answers = 0
  let activeAnswer: number | undefined
  let latestCall: { input: unknown; binding: Binding; seq: number } | undefined
  const raw = new Set<string>()
  const sized = new Set<string>()
  const decoded = new Set<string>()
  let duplicateStages = 0
  const calls = new Set<number>()
  const observedCalls = new Set<number>()
  const frames = new Set<Promise<void>>()
  const restore: (() => void)[] = []
  const serialize = (value: unknown) => {
    let text = JSON.stringify(value, null, 2)
    for (const secret of secrets) text = text.replaceAll(secret, "<redacted-capture-token>")
    return text
  }
  const save = (file: string, value: unknown) =>
    writeFileSync(join(folder, file), serialize(value) + "\n")
  const note = (type: string, extra: object = {}) => {
    const event = {
      at: Date.now(),
      ms: performance.now() - zero,
      stage,
      activeAnswer,
      type,
      ...extra,
    }
    eventBytes += Buffer.byteLength(JSON.stringify(event))
    if (events.length < 5_000 && eventBytes <= 16 * 1024 * 1024) events.push(event)
    else overflow = true
  }
  const state = () => ({
    binding: live?.binding && { ...live.binding },
    shellPid: live?.process.pid,
    exitQueued: live?.exitQueued,
    activity: live?.activity?.state,
    turnAt: live?.activity?.turnAt,
    sessionObservationSeq: live?.agents.agy?.seq,
    requests: live?.activity?.pending.map((request) => ({
      ref: live?.binding && requestRef(live.binding, request),
      requestId: safeId(request.requestId),
      askedAt: request.askedAt,
      kind: request.kind,
      tool: safeId(request.toolName),
      actor: request.actor && hash(request.actor),
      input: payloadMetadata({ toolCall: request.input }),
    })),
  })
  save("summary.json", { outcome: "initializing", complete: false })
  try {
    const installed = await installHarness("agy")
    if (installed.version !== "1.2.14")
      throw new Error("AGY approval capture requires pinned1.2.14")
    save("harness.json", {
      version: installed.version,
      binarySha256: createHash("sha256")
        .update(readFileSync(join(installed.bin, process.platform === "win32" ? "agy.exe" : "agy")))
        .digest("hex"),
      node: process.version,
      platform: process.platform,
    })
  } catch (error) {
    save("summary.json", {
      outcome: "infrastructure-before-scenario",
      complete: false,
      error: String(error),
    })
    throw error
  }
  const inside = run.deck.terminals as unknown as Inside
  const belongs = (incoming: { readonly terminalId?: unknown; readonly token?: unknown }) => {
    const id = incoming.terminalId
    const record = typeof id === "string" ? inside.records.get(id) : undefined
    return (
      typeof id === "string" &&
      (!terminal || terminal.id === id) &&
      approvalSenderMatches(incoming, record && { terminalId: id, token: record.token })
    )
  }
  const stopIngress = watchApprovalIngress((event) => {
    if (event.agent !== "agy" || !belongs(event)) return
    if (typeof event.token === "string") secrets.add(event.token)
    const key = `${event.event}:${event.seq}`
    const observed = event.stage === "raw-ingress" ? raw : sized
    if (observed.has(key)) duplicateStages += 1
    if (observed.size < 5_000) observed.add(key)
    else overflow = true
    note(`hook.${event.stage}`, {
      event: hooks.has(event.event) ? event.event : "other",
      seq: event.seq,
      instance: event.instance,
      firedAt: event.firedAt,
      metadata: payloadMetadata(event.payload, event.wireBytes),
    })
  })
  const priorReport = Object.getOwnPropertyDescriptor(inside, "report")
  const report = inside.report
  const adapter = harnesses.agy as { decode: typeof harnesses.agy.decode }
  const decode = adapter.decode
  if (typeof report !== "function" || typeof decode !== "function") {
    stopIngress()
    save("summary.json", { outcome: "instrumentation-unavailable", complete: false })
    throw new Error("The AGY approval capture report/decoder boundary changed")
  }
  inside.report = async function (incoming, deadline) {
    if (!belongs(incoming)) return report.call(this, incoming, deadline)
    secrets.add(incoming.token)
    note("hook.report-enter", {
      event: hooks.has(incoming.event) ? incoming.event : "other",
      seq: incoming.seq,
      instance: incoming.instance,
      ...state(),
    })
    const answer = await report.call(this, incoming, deadline)
    const observationRecorded = live?.agents.agy?.seq === incoming.seq
    if (
      incoming.event === "PreToolUse" &&
      incoming.terminalId === terminal?.id &&
      observationRecorded &&
      live?.binding &&
      incoming.instance === live.binding.instance &&
      incoming.payload.conversationId === live.binding.sessionId
    ) {
      observedCalls.add(incoming.seq)
      latestCall = {
        input: incoming.payload.toolCall,
        binding: { ...live.binding },
        seq: incoming.seq,
      }
    }
    note("hook.report-return", {
      sessionObservationRecorded: observationRecorded,
      event: hooks.has(incoming.event) ? incoming.event : "other",
      seq: incoming.seq,
      ...state(),
    })
    return answer
  }
  restore.push(() => {
    if (priorReport) Object.defineProperty(inside, "report", priorReport)
    else delete (inside as Partial<Inside>).report
  })
  adapter.decode = (incoming) => {
    const facts = decode(incoming)
    if (!belongs(incoming)) return facts
    const key = `${incoming.event}:${incoming.seq}`
    if (decoded.has(key)) duplicateStages += 1
    if (decoded.size < 5_000) decoded.add(key)
    else overflow = true
    if (incoming.event === "PreToolUse" && incoming.terminalId === terminal?.id) {
      calls.add(incoming.seq)
    }
    note("hook.decoded", {
      event: hooks.has(incoming.event) ? incoming.event : "other",
      seq: incoming.seq,
      instance: incoming.instance,
      firedAt: incoming.firedAt,
      metadata: payloadMetadata(incoming.payload),
      facts: facts.map((fact) => ({
        type: fact.type,
        ...("requestId" in fact && { requestId: safeId(fact.requestId) }),
        ...("kind" in fact && { kind: fact.kind }),
      })),
      ...state(),
    })
    return facts
  }
  restore.push(() => {
    adapter.decode = decode
  })
  return {
    attach: (found: DeckTerminal) => {
      if (terminal) throw new Error("AGY approval capture must use one terminal")
      terminal = found
      live = inside.records.get(found.id)
      if (!live || typeof live.process.write !== "function" || !live.chain)
        throw new Error("The AGY approval capture PTY/draw boundary changed")
      const current = live
      const child = current.process
      const write = child.write
      child.write = function (data) {
        note("pty.input", { data, ...state() })
        try {
          const result = write.call(this, data)
          note("pty.input.returned", { data })
          return result
        } catch (error) {
          note("pty.input.failed", { error: String(error) })
          throw error
        }
      }
      restore.push(() => {
        child.write = write
      })
      const native = child.onData((data) => {
        const sourceMs = performance.now() - zero
        nativeBytes += Buffer.byteLength(data)
        if (nativeBytes <= 8 * 1024 * 1024 && output.length < 8_192)
          output.push({ at: Date.now(), ms: sourceMs, stage, data })
        else nativeOverflow = true
        const rendered = current.chain
          .then(() => {
            frameCount += 1
            note("native.frame", { sourceMs, screen: screenText(current.screen), ...state() })
          })
          .catch((error: unknown) => {
            frameErrors += 1
            note("native.frame.error", { error: String(error) })
          })
        frames.add(rendered)
        void rendered.finally(() => frames.delete(rendered))
      })
      restore.push(() => native.dispose())
      const answer = found.answer
      Object.defineProperty(found, "answer", {
        configurable: true,
        value: async (ref: string, response: Parameters<DeckTerminal["answer"]>[1]) => {
          activeAnswer = ++answers
          note("answer.begin", { ref, type: response.type, dialog: response.dialog, ...state() })
          try {
            await answer(ref, response)
            note("answer.return", { ref, ...state() })
          } catch (error) {
            note("answer.failed", { ref, error: String(error), ...state() })
            throw error
          } finally {
            activeAnswer = undefined
          }
        },
      })
      restore.push(() =>
        Object.defineProperty(found, "answer", { configurable: true, value: answer }),
      )
      note("scenario.attached", { screen: screenText(current.screen), ...state() })
    },
    failed: (error: unknown) => {
      failed = String(error)
      note("scenario.failed", { error: failed, ...state() })
    },
    finish: async () => {
      stage = "finalizing-before-fixture-teardown"
      let snapshot: ReturnType<typeof screenText> | undefined
      let collectionError: string | undefined
      let observerErrors = 0
      try {
        if (terminal) {
          snapshot = await terminal.screenText()
          save("final.json", { screen: snapshot, ...state() })
          save("history.json", terminal.history())
          save(
            "transcript.json",
            (await terminal.transcript())
              .filter((item) => item.kind === "text")
              .map((item) => ({ index: item.index, role: item.role, text: item.text })),
          )
        }
      } catch (error) {
        collectionError = String(error)
      } finally {
        stage = "stopped-before-fixture-teardown"
        observerErrors = stopIngress()
        for (const undo of restore.toReversed()) {
          try {
            undo()
          } catch (error) {
            collectionError ??= String(error)
          }
        }
      }
      await Promise.all(frames)
      const same =
        latestCall &&
        live?.binding &&
        latestCall.binding.instance === live.binding.instance &&
        latestCall.binding.sessionId === live.binding.sessionId
      const dialog =
        same && snapshot && latestCall
          ? harnesses.agy.dialogs?.read(snapshot.rows, {
              kind: "permission",
              tool: "confirmation",
              input: latestCall.input,
              cwd: null,
            })
          : undefined
      const target =
        failed &&
        calls.size >= 2 &&
        answers === 1 &&
        live?.activity?.pending.length === 0 &&
        dialog?.dialog.type === "choices"
      const pairing = observationPairs(
        [...raw],
        [...sized],
        [...decoded],
        Boolean(
          overflow ||
          nativeOverflow ||
          collectionError ||
          observerErrors ||
          frameErrors ||
          duplicateStages,
        ),
      )
      const complete = Boolean(
        terminal && snapshot && output.length && frameCount && pairing.complete,
      )
      const outcome = target
        ? "visible-matching-permission-without-request"
        : failed
          ? "scenario-failure"
          : "passed"
      save("summary.json", {
        outcome,
        complete,
        failed,
        collectionError,
        observerErrors,
        frameErrors,
        duplicateStages,
        overflow,
        nativeOverflow,
        counts: {
          raw: raw.size,
          sized: sized.size,
          decoded: decoded.size,
          preToolUse: calls.size,
          sessionObservedPreToolUse: observedCalls.size,
          answers,
          nativeChunks: output.length,
          nativeFrames: frameCount,
        },
        missingRaw: pairing.missingRaw,
        missingSized: pairing.missingSized,
        missingDecoded: pairing.missingDecoded,
        finalMatchingPermission: Boolean(dialog),
        ...state(),
      })
      save(
        "model.json",
        run.model.calls.map((call) => ({
          side: call.side,
          toolResults: call.turns.filter((turn) => turn.role === "tool").length,
          syntheticUser: call.turns.some(
            (turn) => turn.role === "user" && turn.text.includes("Run it twice"),
          ),
        })),
      )
      writeFileSync(
        join(folder, "events.jsonl"),
        events.map((item) => serialize(item).replaceAll("\n", "")).join("\n") + "\n",
      )
      writeFileSync(
        join(folder, "native-output.jsonl"),
        output.map((item) => serialize(item).replaceAll("\n", "")).join("\n") + "\n",
      )
      if (!failed && !complete && process.env.NOVADECK_AGY_APPROVAL_SCOPE !== "suite")
        throw new Error("The AGY approval capture was incomplete")
    },
  }
}
