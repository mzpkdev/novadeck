import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import type { Harness } from "../harnesses/harness.js"
import { agents, harnesses } from "../harnesses/registry.js"
import type { DeliveryEvent } from "../messaging/delivery.js"
import { Messaging } from "../messaging/messaging.js"
import type { Report } from "../shell/reports.js"
import { Terminals } from "../terminals/manager.js"
import type { FakeModel } from "./model/server.js"

/**
 * Where a failed test's trace goes (`NOVADECK_E2E_TRACES`), as CI uploads it; none is
 * written where it is unset.
 */
const folder = process.env.NOVADECK_E2E_TRACES

// What one line of a trace shows of a value: its JSON, cut short.
const brief = (value: unknown, most = 160): string => {
  const text = JSON.stringify(value) ?? String(value)
  return text.length > most ? `${text.slice(0, most)}…` : text
}

type Live = {
  readonly terminalId: string
  readonly handle: string
  delivery: { readonly state: string; readonly byPerson: boolean }
}
type Inside = {
  step: (live: Live, event: DeliveryEvent) => void
  keys: Messaging["keys"]
  ask: Messaging["ask"]
}
type Runner = {
  queue: <T>(terminalId: string, work: () => Promise<T>, fallback: T) => Promise<T>
  report: (report: Report, deadline?: number) => Promise<unknown>
}

/**
 * What the runner heard and did during one test, for reading a failure afterwards where
 * its screens don't say why (as on a CI runner): each hook's report as it came, with when
 * its hook started, and what it decoded to; the person's keys; each change of a terminal's
 * delivery and what caused it; each answer to a hook that asks; and when each report
 * reached the runner, began to be handled after the terminal's earlier ones, and was done.
 * The runner runs in this process, so its harnesses' decoders, its messaging and its
 * report handling are wrapped while the test runs.
 */
export const startTrace = (name: string, model: FakeModel) => {
  const started = Date.now()
  const lines: string[] = []
  const at = (time = Date.now()) => `+${String(Math.round(time - started)).padStart(6)}`
  // Each terminal by its handle, once its delivery has been seen.
  const handles = new Map<string, string>()
  const named = (terminalId: string) => handles.get(terminalId) ?? terminalId.slice(0, 8)
  const add = (line: string) => lines.push(`${at()} ${line}`)

  // The model's calls, as they come, a few milliseconds late at most.
  let seen = model.calls.length
  const calls = setInterval(() => {
    for (; seen < model.calls.length; seen += 1)
      add(
        `model ${
          model
            .trail(model.calls.length - seen)
            .split("\n")[1]
            ?.trim() ?? ""
        }`,
      )
  }, 10)
  calls.unref()

  const decoders = new Map<string, Harness["decode"]>()
  for (const agent of agents) {
    const harness = harnesses[agent] as { decode: Harness["decode"] }
    const { decode } = harness
    decoders.set(agent, decode)
    harness.decode = (report) => {
      const events = decode(report)
      const { payload } = report
      const said = payload.prompt ?? payload.agent_state ?? payload.hook_event_name
      add(
        `report ${report.agent} ${report.event} hook started ${at(report.seq)} in ${report.instance ?? "?"}` +
          `${said === undefined ? "" : ` (${brief(said, 80)})`} → ${brief(
            events.map((event) => ({
              type: event.type,
              ...("cause" in event && { cause: event.cause }),
              ...("outcome" in event && { outcome: event.outcome }),
            })),
            300,
          )}`,
      )
      return events
    }
  }

  const inside = Messaging.prototype as unknown as Inside
  const { step, keys, ask } = inside
  inside.step = function (live, event) {
    handles.set(live.terminalId, live.handle)
    const before = live.delivery.state
    step.call(this, live, event)
    const after = live.delivery
    if (after.state !== before || event.type !== "key")
      add(
        `delivery ${live.handle} ${brief(event, 200)}: ${before} → ${after.state}${after.byPerson ? " (by the person)" : ""}`,
      )
  }
  inside.keys = function (terminalId, kinds, asked) {
    add(`keys ${named(terminalId)} ${kinds.join(",")}${asked ? " (asked)" : ""}`)
    keys.call(this, terminalId, kinds, asked)
  }
  inside.ask = function (terminalId, report) {
    const answer = ask.call(this, terminalId, report)
    add(
      `answer ${named(terminalId)} ${report.agent} ${report.event}: ${
        answer.leaseId === null ? "no lease" : `lease ${answer.leaseId}`
      }, ${answer.stdout === null ? "prints nothing" : brief(answer.stdout, 120)}`,
    )
    return answer
  }

  // When a report came, began after the terminal's earlier ones, and was done.
  const runner = Terminals.prototype as unknown as Runner
  const { queue, report: handle } = runner
  runner.queue = function <T>(terminalId: string, work: () => Promise<T>, fallback: T) {
    const came = Date.now()
    return queue.call(
      this,
      terminalId,
      async () => {
        const began = Date.now()
        try {
          return await work()
        } finally {
          add(
            `handled ${named(terminalId)} a report that came at ${at(came)}: began ${at(began)}, took ${Date.now() - began} ms`,
          )
        }
      },
      fallback,
    ) as Promise<T>
  }
  runner.report = function (report, deadline) {
    add(
      `handling ${named(report.terminalId)} ${report.agent} ${report.event} (hook started ${at(report.seq)})`,
    )
    return handle.call(this, report, deadline)
  }

  return {
    /** Puts the runner back as it was. */
    stop: () => {
      clearInterval(calls)
      Object.assign(runner, { queue, report: handle })
      for (const [agent, decode] of decoders)
        (harnesses[agent as keyof typeof harnesses] as { decode: Harness["decode"] }).decode =
          decode
      Object.assign(inside, { step, keys, ask })
    },
    /** Writes the trace, with what else is given, where failed tests' traces go. */
    write: () => {
      if (!folder) return
      const more = model.trail(40)
      mkdirSync(folder, { recursive: true })
      const file = `${name.replaceAll(/[^\w.-]+/g, "-").slice(0, 150)}.txt`
      writeFileSync(join(folder, file), `${name}\n\n${lines.join("\n")}\n\n${more}\n`)
    },
  }
}
