import { z } from "zod"

/**
 * What an agent asks to describe its own terminal with, through NovaDeck's MCP server: a
 * title, a summary of its work, and whether the person asked, in their own words, for
 * this title. There is no target: it is always the caller's terminal.
 */
export const describeRequest = z.strictObject({
  title: z.string().max(1024),
  summary: z.string().max(4096),
  asked: z.boolean().optional(),
})

/**
 * Why a description kept the terminal's title: the person gave it (`person`), or `asked`
 * came outside a root turn the person's own prompt started (`unasked`).
 */
export type Kept = "person" | "unasked"

/** The MCP server's answer: the terminal's title now, and why its title stayed, if it did. */
export type DescribeAnswer =
  | { readonly ok: true; readonly title: string; readonly kept?: Kept }
  | { readonly ok: false; readonly reason: string }
