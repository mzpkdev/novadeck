import { createHash } from "node:crypto"

export const approvalTest =
  "approves two identical queued commands from the chat in turn, each running once"
const bodyHash = "5862abac06a3004ebee9d226e7bd79d03f3cb0691acd0bdfda7a480b310e4220"
const once = (source: string, needle: string, replacement: string) => {
  if (source.split(needle).length !== 2)
    throw new Error(`AGY approval capture boundary changed: ${needle}`)
  return source.replace(needle, replacement)
}

/** Instrument only the two reviewed source boundaries; ordinary builds never call this. */
export const instrumentApproval = (
  source: string,
  id: string,
  events: string,
  recorder: string,
) => {
  source = source.replaceAll("\r\n", "\n")
  const path = id.split("?")[0]!.replaceAll("\\", "/")
  if (path.endsWith("/application/runner/src/shell/hook.ts")) {
    let code = once(
      source,
      "  if (!object(payload)) return undefined",
      `  if (!object(payload)) return undefined
  __approvalIngress({ stage: "raw-ingress", agent: agent.data, event: typeof value.event === "string" ? value.event : "", seq, payload, wireBytes: Buffer.byteLength(sent) })`,
    )
    code = once(
      code,
      "  if (JSON.stringify(sized).length > maxReport) return undefined",
      `  if (JSON.stringify(sized).length > maxReport) return undefined
  __approvalIngress({ stage: "sized-payload", agent: agent.data, event, seq, instance, firedAt, payload: sized.payload })`,
    )
    if (!source.includes("payload = JSON.parse(sent)"))
      throw new Error("AGY hook ingress no longer parses the original payload")
    return {
      name: "hook",
      file: "application/runner/src/shell/hook.ts",
      code: `import { observeApprovalIngress as __approvalIngress } from ${JSON.stringify(events)}\n${code}`,
    }
  }
  if (!path.endsWith("/application/runner/src/e2e/answers.e2e.ts")) return undefined
  const marker = JSON.stringify(approvalTest)
  if (source.split(marker).length !== 2) throw new Error("AGY approval capture case changed")
  const open = "async ({ e2e: run }) => {"
  const from = source.indexOf(open, source.indexOf(marker)) + open.length
  const to = source.indexOf("\n      },\n    )", from)
  const body = source.slice(from, to)
  if (from < open.length || to < 0 || createHash("sha256").update(body).digest("hex") !== bodyHash)
    throw new Error(
      "The original AGY approval scenario changed; review the capture before updating its hash",
    )
  const attached = once(
    body,
    "const t1 = await start(run, setup)",
    "const t1 = await start(run, setup)\n        __capture.attach(t1)",
  )
  const replacement = `
        const __capture = await __startApprovalCapture(run)
        try {${attached}
        } catch (__error) {
          __capture.failed(__error)
          throw __error
        } finally {
          await __capture.finish()
        }`
  return {
    name: "case",
    file: "application/runner/src/e2e/answers.e2e.ts",
    code: `import { startApprovalCapture as __startApprovalCapture } from ${JSON.stringify(recorder)}\n${source.slice(0, from)}${replacement}${source.slice(to)}`,
  }
}
