import { createHash } from "node:crypto"
import { constants, type Stats } from "node:fs"
import { open, realpath, stat, type FileHandle } from "node:fs/promises"
import { basename, extname, resolve } from "node:path"
import { StringDecoder } from "node:string_decoder"

import type { AgentName, ItemContent } from "@novadeck/protocol"

import type { PlanSource } from "../harnesses/events.js"
import { harnesses } from "../harnesses/registry.js"
import type { ItemRecord } from "./records.js"
import { failure, maxUrlChars, type PresentFailure } from "./request.js"
import { secret } from "./secrets.js"

// What is shown as an image, by extension.
const images: { readonly [extension: string]: string } = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
}
/** The largest image previewed; a larger one is listed without its picture. */
export const maxImageBytes = 8 * 1024 * 1024
// How much of a text file is read at most; past it, its lines are cut short.
const textBudget = 4 * 1024 * 1024
// A text file has no NUL byte in this much of its start.
const sniffBytes = 8 * 1024
// A file this long is shown whole; a longer one, around what was pointed at.
const wholeLines = 400
const contextLines = 40
// What the protocol takes of a file and a plan.
const maxLines = 2000
const maxLineChars = 4096
const maxPlanBytes = 256 * 1024

/** What an item's content reads of a pointer: unavailable, with why, or ready. */
type Unavailable = Extract<ItemContent, { state: "unavailable" }>
const unavailable = (reason: Unavailable["reason"], size: number | null = null): Unavailable => ({
  state: "unavailable",
  reason,
  size,
})

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `…${text.slice(text.length - max + 1)}`

/** Whether a file is shown as an image, by its extension. */
export const isImage = (path: string): boolean => images[extname(path).toLowerCase()] !== undefined

/**
 * The lines of a file of `total` lines shown, from `first` to `last`, and the ones
 * pointed at, `from` to `to`: every line of a short file; around `lines` in a longer
 * one, with some context each side; or its start. Lines past the end are pulled back to
 * it, and `clamped` says so.
 */
export const captureWindow = (
  total: number,
  lines: { readonly from: number; readonly to: number } | null | undefined,
): { first: number; last: number; from: number; to: number; clamped: boolean } => {
  const from = Math.min(lines?.from ?? 1, total)
  const to = Math.min(lines?.to ?? total, total)
  const clamped = lines !== null && lines !== undefined && (from !== lines.from || to !== lines.to)
  if (total <= wholeLines) return { first: 1, last: total, from, to, clamped }
  if (!lines) return { first: 1, last: wholeLines, from: 1, to: wholeLines, clamped }
  const first = Math.max(1, from - contextLines)
  const last = Math.min(total, to + contextLines, first + maxLines - 1)
  return { first, last, from, to: Math.min(to, last), clamped }
}

/** What a path points at, once checked the cheap way, as show and attach take it. */
export type Pointed = {
  readonly ok: true
  /** Its path, symlinks resolved. */
  readonly path: string
  readonly kind: "image" | "file"
  readonly size: number
  readonly held: boolean
}

/**
 * A file a request points at, from the terminal's directory: anything but a missing
 * path, a folder, or a pipe or device. What it holds is read only as it loads.
 */
export const pointAt = async (given: string, cwd: string): Promise<Pointed | PresentFailure> => {
  const path = await realpath(resolve(cwd, given)).catch(() => undefined)
  if (!path) return failure("That file doesn't exist.")
  const stats = await stat(path).catch(() => undefined)
  if (!stats) return failure("That file doesn't exist.")
  if (stats.isDirectory()) return failure("That's a folder; only files can be shown.")
  if (!stats.isFile()) return failure("Only files can be shown, not a pipe or a device.")
  return {
    ok: true,
    path,
    kind: isImage(path) ? "image" : "file",
    size: stats.size,
    held: secret(path),
  }
}

/**
 * A page, by its address: any http(s) page, which the desktop app loads in its own
 * locked-down browser view. An address carrying a user name or password is refused,
 * as it would show them.
 */
export const pageAt = (
  address: string,
): { readonly ok: true; readonly url: URL } | PresentFailure => {
  let url: URL
  try {
    url = new URL(address)
  } catch {
    return failure("That isn't a valid address.")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return failure("NovaDeck shows only http and https pages.")
  if (url.username || url.password)
    return failure("NovaDeck won't show an address with a user name or password in it.")
  // Encoding can lengthen it past what the protocol carries.
  if (url.href.length > maxUrlChars) return failure("That address is too long.")
  return { ok: true, url }
}

/** Why a file can't be read, by its error. */
const reasonOf = (error: unknown): Unavailable["reason"] => {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (code === "ENOENT" || code === "ENOTDIR") return "missing"
  if (code === "EISDIR") return "not-a-file"
  return "unreadable"
}

/** What says a file changed: its size, when it last changed, and which file it is. */
const stampOf = (stats: Stats): string => `${stats.size}:${stats.mtimeMs}:${stats.ino}`

const hashOf = (text: string): string =>
  createHash("sha256").update(text).digest("base64url").slice(0, 22)

/**
 * Opens a plain file for reading: a pipe or device put in its place never blocks the
 * reader, and a symlink put there since it was resolved isn't followed.
 */
const openPlain = async (
  path: string,
): Promise<{ handle: FileHandle; stats: Stats } | Unavailable> => {
  const handle = await open(
    path,
    constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0),
  )
  const stats = await handle.stat().catch(async (error: unknown) => {
    await handle.close()
    throw error
  })
  if (stats.isFile()) return { handle, stats }
  await handle.close()
  return unavailable("not-a-file")
}

/**
 * Reads up to `limit` bytes of a file, to its end rather than its reported size, which a
 * file in /proc gives as 0; `more` when it holds more than that.
 */
const readUpTo = async (
  handle: FileHandle,
  limit: number,
): Promise<{ bytes: Buffer; more: boolean }> => {
  const buffer = Buffer.alloc(limit + 1)
  let read = 0
  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- One chunk after another.
    const { bytesRead } = await handle.read(buffer, read, buffer.length - read, read)
    read += bytesRead
    if (bytesRead === 0 || read === buffer.length) break
  }
  return { bytes: buffer.subarray(0, Math.min(read, limit)), more: read > limit }
}

/**
 * An image or a text file, as it is now, symlinks resolved. One that may hold secrets is
 * `held` unless `reveal`; an image past the preview limit is `too-large`; a text file
 * with a NUL byte near its start is `binary`. A text file is read up to a budget, then
 * shown around its lines.
 */
export const loadFile = async (
  item: Pick<ItemRecord, "kind" | "path" | "lines" | "held">,
  reveal: boolean,
): Promise<ItemContent> => {
  if (item.path === null) return unavailable("missing")
  let path: string
  try {
    path = await realpath(item.path)
  } catch (error) {
    return unavailable(reasonOf(error))
  }
  let opened: Awaited<ReturnType<typeof openPlain>>
  try {
    opened = await openPlain(path)
  } catch (error) {
    return unavailable(reasonOf(error))
  }
  if ("state" in opened) return opened
  const { handle, stats } = opened
  try {
    if ((item.held || secret(path)) && !reveal) return unavailable("held", stats.size)
    const stamp = stampOf(stats)
    if (item.kind === "image") {
      if (stats.size > maxImageBytes) return unavailable("too-large", stats.size)
      const { bytes, more } = await readUpTo(handle, maxImageBytes)
      if (more) return unavailable("too-large", stats.size)
      const mime = images[extname(path).toLowerCase()] ?? "application/octet-stream"
      return {
        state: "ready",
        stamp,
        content: { kind: "image", src: `data:${mime};base64,${bytes.toString("base64")}` },
      }
    }
    const { bytes, more } = await readUpTo(handle, textBudget)
    if (bytes.subarray(0, sniffBytes).includes(0)) return unavailable("binary", stats.size)
    // A character cut at the budget is left out rather than mangled.
    const all = new StringDecoder("utf8").write(bytes).split(/\r\n|\r|\n/)
    // Cut short, its last line is partial; whole, the line a final newline ends is the last.
    if (all.length > 1 && (more || all.at(-1) === "")) all.pop()
    const window = captureWindow(all.length, item.lines)
    return {
      state: "ready",
      stamp,
      content: {
        kind: "file",
        path: clip(path, 4096),
        firstLine: window.first,
        lines: all.slice(window.first - 1, window.last).map((line) => line.slice(0, maxLineChars)),
        from: window.from,
        to: window.to,
        total: more ? null : all.length,
        truncated: more,
        clamped: window.clamped,
      },
    }
  } catch (error) {
    return unavailable(reasonOf(error))
  } finally {
    await handle.close().catch(() => {})
  }
}

/** A plan's text, cut short past what the protocol takes, and when it last changed. */
export type PlanText = {
  readonly text: string
  readonly truncated: boolean
  readonly changedAt: number | null
}

/** A plan's file as it stands, or undefined while it is not there, or not a file. */
export const readPlanFile = async (
  path: string,
): Promise<(PlanText & { readonly stamp: string }) | undefined> => {
  try {
    // A pipe or device put in a plan's place never blocks the reader.
    const handle = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0))
    try {
      const stats = await handle.stat()
      if (!stats.isFile()) return undefined
      const { bytes, more } = await readUpTo(handle, maxPlanBytes)
      // A character cut at the limit is left out rather than mangled.
      const text = new StringDecoder("utf8").write(bytes)
      return { text, truncated: more, changedAt: Math.round(stats.mtimeMs), stamp: stampOf(stats) }
    } finally {
      await handle.close()
    }
  } catch {
    return undefined
  }
}

// What was last read of each transcript or rollout holding text plans, by its path, with
// the stamp it was read at: a long rollout is decoded again only once it changes.
const decoded = new Map<string, { readonly stamp: string; readonly plan: PlanText | undefined }>()
const maxDecoded = 16

/**
 * The latest plan presented as text that a transcript or rollout records, read with its
 * harness's own decoders; undefined when the file is gone or records none.
 */
export const readTextPlan = async (
  agent: AgentName,
  path: string,
): Promise<PlanText | undefined> => {
  const plans = harnesses[agent].plans
  if (!plans) return undefined
  let handle: FileHandle
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0))
  } catch {
    return undefined
  }
  try {
    const stats = await handle.stat()
    if (!stats.isFile()) return undefined
    const stamp = stampOf(stats)
    const known = decoded.get(path)
    if (known?.stamp === stamp) return known.plan
    let latest: PlanText | undefined
    for await (const line of handle.readLines({ autoClose: false }))
      for (const { source, at } of plans(line))
        if (source.kind === "text")
          latest = { text: source.text, truncated: source.truncated, changedAt: at }
    decoded.delete(path)
    decoded.set(path, { stamp, plan: latest })
    for (const oldest of decoded.keys()) {
      if (decoded.size <= maxDecoded) break
      decoded.delete(oldest)
    }
    return latest
  } catch {
    return undefined
  } finally {
    await handle.close().catch(() => {})
  }
}

/** A plan's text, as `content` yields it, stamped by its text. */
export const planReady = (plan: PlanText): ItemContent => ({
  state: "ready",
  stamp: hashOf(plan.text),
  content: { kind: "plan", ...plan },
})

/**
 * A plan's content: its file as it stands, or for one presented as text, the latest its
 * transcript or rollout records, unless `live` already has it. `gone` once neither does.
 */
export const loadPlan = async (
  item: Pick<ItemRecord, "path" | "plan">,
  live: PlanText | undefined,
): Promise<ItemContent> => {
  if (item.path === null || item.plan === null) return unavailable("gone")
  if (item.plan.format === "file") {
    const plan = await readPlanFile(item.path)
    if (!plan) return unavailable("gone")
    const { stamp, ...text } = plan
    return { state: "ready", stamp, content: { kind: "plan", ...text } }
  }
  const plan = live ?? (await readTextPlan(item.plan.agent, item.path))
  return plan ? planReady(plan) : unavailable("gone")
}

/**
 * A plan's title: its first heading, or its file's name when it has none; undefined while
 * its file can't be read.
 */
export const planTitle = async (source: PlanSource): Promise<string | undefined> => {
  const text = source.kind === "text" ? source.text : (await readPlanFile(source.path))?.text
  if (text === undefined) return undefined
  const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/m.exec(text)?.[1]
  return heading ?? (source.kind === "file" ? basename(source.path) : undefined)
}

/**
 * What says an item may read differently now, cheaply: its file's stamp, or what `live`
 * has of a text plan. Content is read again, and compared, only when this changes.
 */
export const probe = async (
  item: Pick<ItemRecord, "kind" | "path" | "plan">,
  live: PlanText | undefined,
): Promise<string> => {
  if (item.kind === "page" || item.path === null) return ""
  const file = await stat(item.path).then(stampOf, () => "")
  return live ? `${file}|${hashOf(live.text)}` : file
}
