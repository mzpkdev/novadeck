import { createHash } from "node:crypto"

const object = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const named = (value: unknown, allowed: readonly string[]) =>
  typeof value !== "string"
    ? { type: typeof value }
    : allowed.includes(value)
      ? { value }
      : { type: "string", sha256: hash(value), length: value.length }
const session = (value: unknown) =>
  typeof value === "string" && /^[a-f\d-]{36}$/i.test(value) ? value : undefined

/** Only the allowlisted metadata leaves this function; arbitrary values are hashed. */
export const payloadMetadata = (payload: unknown, wireBytes?: number) => {
  const value = object(payload)
  if (!value) return { object: false, type: typeof payload }
  const flag = value.tool_confirmation_pending
  const call = object(value.toolCall)
  const args = object(call?.args)
  return {
    object: true,
    keys: Object.keys(value).length,
    bytes: wireBytes ?? Buffer.byteLength(JSON.stringify(value)),
    confirmation: {
      present: Object.hasOwn(value, "tool_confirmation_pending"),
      type: flag === null ? "null" : typeof flag,
      ...(typeof flag === "boolean" || flag === null ? { value: flag } : {}),
      ...(typeof flag === "string" ? { sha256: hash(flag), length: flag.length } : {}),
    },
    state: named(value.agent_state, [
      "idle",
      "working",
      "tool_use",
      "authenticating",
      "initializing",
    ]),
    sessionId: session(value.conversation_id) ?? session(value.conversationId),
    step:
      typeof value.stepIdx === "number" && Number.isFinite(value.stepIdx)
        ? value.stepIdx
        : undefined,
    tool:
      call &&
      named(call.name, ["run_command", "write_to_file", "replace_file_content", "ask_question"]),
    inputSha256: args && hash(JSON.stringify(args)),
    command:
      typeof args?.CommandLine === "string"
        ? { sha256: hash(args.CommandLine), synthetic: args.CommandLine === "echo approved" }
        : undefined,
  }
}

export const observationPairs = <T extends string | number>(
  raw: readonly T[],
  sized: readonly T[],
  decoded: readonly T[],
  broken: boolean,
) => {
  const missingRaw = decoded.filter((seq) => !raw.includes(seq))
  const missingSized = raw.filter((seq) => !sized.includes(seq))
  const missingDecoded = sized.filter((seq) => !decoded.includes(seq))
  const duplicates = [raw, sized, decoded].some((stage) => new Set(stage).size !== stage.length)
  return {
    duplicates,
    missingRaw,
    missingSized,
    missingDecoded,
    complete: Boolean(
      raw.length &&
      decoded.length &&
      !missingRaw.length &&
      !missingSized.length &&
      !missingDecoded.length &&
      !broken &&
      !duplicates,
    ),
  }
}

export type Ingress = {
  readonly stage: "raw-ingress" | "sized-payload"
  readonly agent: string
  readonly event: string
  readonly seq: number
  readonly instance?: string | null
  readonly firedAt?: number
  readonly payload: unknown
  readonly wireBytes?: number
}
let observer: ((event: Ingress) => void) | undefined
let errors = 0

/** Test-only synchronous observation, never allowed to change a hook's return value. */
export const observeApprovalIngress = (event: Ingress): void => {
  try {
    observer?.(event)
  } catch {
    errors += 1
  }
}
export const watchApprovalIngress = (listen: (event: Ingress) => void) => {
  if (observer) throw new Error("An AGY approval capture is already active")
  errors = 0
  observer = listen
  return () => {
    observer = undefined
    return errors
  }
}
