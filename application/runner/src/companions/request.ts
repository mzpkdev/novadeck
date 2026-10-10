import type { CompanionItem } from "@novadeck/protocol"
import { z } from "zod"

/**
 * What an agent asks to show, through Novadeck's MCP server: one source, under the key
 * that names it, with that source's own options inside it, and the options every source
 * shares beside it: a title in place of the source's name, and `open` when the person
 * asked to see it. A `file` is a path, absolute or from the terminal's directory, and
 * for a text file the lines it points at; a `url` is a page's http(s) address.
 */
// What every request takes: a short name to show, and whether the person asked to see it.
const shared = { title: z.string().min(1).max(256).optional(), open: z.boolean().optional() }

/** Lines of a text file to point at, from the first to the last. */
export const lineRange = z
  .strictObject({ from: z.int().min(1), to: z.int().min(1) })
  .refine(({ from, to }) => to >= from)

/** A file to show, by its path, and the lines to point at. */
export const fileSource = z.strictObject({
  path: z.string().min(1).max(4096),
  lines: lineRange.optional(),
})

export const fileRequest = z.strictObject({ file: fileSource, ...shared })

/** What the protocol takes of a page's address. */
export const maxUrlChars = 8192

/** A page to show, by its http(s) address. */
export const pageRequest = z.strictObject({ url: z.string().min(1).max(maxUrlChars), ...shared })

/** Each source a request may give, by the key that names it. A new kind adds one here. */
const sources = { file: fileRequest, url: pageRequest } as const

/** The keys that name a source, as `show` lists them. */
export const sourceNames = Object.keys(sources) as readonly (keyof typeof sources)[]

export type FileRequest = z.infer<typeof fileRequest>
export type PageRequest = z.infer<typeof pageRequest>
export type PresentRequest = FileRequest | PageRequest

/** Why it was not shown, in a sentence the agent can act on. */
export type PresentFailure = { readonly ok: false; readonly reason: string }

/**
 * The MCP server's answer: what the person now sees beside the terminal, or why not.
 * `opened` when it opened at once; `again` when it updated what was already there;
 * `held` when it may hold secrets, so it waits for the person to open it; `tooLarge`
 * for an image too large to preview.
 */
export type PresentAnswer =
  | {
      readonly ok: true
      readonly id: string
      readonly kind: CompanionItem["kind"]
      readonly name: string
      readonly opened: boolean
      readonly again: boolean
      readonly held?: true
      readonly tooLarge?: true
    }
  | PresentFailure

export const failure = (reason: string): PresentFailure => ({ ok: false, reason })

const listed = sourceNames.join(" or ")
const oneSource = `one source, ${listed}`

/** The request, or why it cannot be one. */
export const readRequest = (
  value: unknown,
): { readonly ok: true; readonly request: PresentRequest } | PresentFailure => {
  if (typeof value !== "object" || value === null) return failure("The request is not valid.")
  // Exactly one source, read strictly by its own schema, so it names what's wrong.
  const given = sourceNames.filter((name) => name in value)
  if (given.length === 0) return failure(`Give ${oneSource}.`)
  if (given.length > 1) return failure(`Give ${oneSource}, not several.`)
  const parsed = sources[given[0]!].safeParse(value)
  if (parsed.success) return { ok: true, request: parsed.data }
  const [issue] = parsed.error.issues
  // A key no source knows is named too, as "file.open" or "lines".
  const path = issue?.code === "unrecognized_keys" ? [...issue.path, issue.keys[0]] : issue?.path
  const field = path?.join(".")
  return failure(field ? `The request's "${field}" is not valid.` : "The request is not valid.")
}
