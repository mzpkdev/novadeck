import { open, stat } from "node:fs/promises"
import { StringDecoder } from "node:string_decoder"

import type { PlanContent } from "@novadeck/protocol"

import type { PlanSource } from "../harnesses/events.js"

// The most of a plan's file read, as the protocol takes it.
const maxBytes = 256 * 1024

/** A file's size and when it last changed, or undefined while it is not there. */
export const planStamp = (source: PlanSource): Promise<string | undefined> =>
  source.kind === "text"
    ? Promise.resolve("text")
    : stat(source.path).then(
        ({ size, mtimeMs }) => `${size}:${mtimeMs}`,
        () => undefined,
      )

/** A plan's text as it stands, or undefined while its file is not there. */
export const planContent = async (
  ref: string,
  source: PlanSource,
): Promise<PlanContent | undefined> => {
  if (source.kind === "text") return { ref, text: source.text, truncated: false, changedAt: null }
  try {
    const handle = await open(source.path, "r")
    try {
      const { size, mtimeMs } = await handle.stat()
      const buffer = Buffer.alloc(Math.min(size, maxBytes))
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      // A character cut at the limit is left out rather than mangled.
      const text = new StringDecoder("utf8").write(buffer.subarray(0, bytesRead))
      return { ref, text, truncated: size > bytesRead, changedAt: Math.round(mtimeMs) }
    } finally {
      await handle.close()
    }
  } catch {
    return undefined
  }
}
