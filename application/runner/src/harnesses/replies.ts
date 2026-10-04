import type { HarnessEvent } from "./events.js"
import { tailLines } from "./follow.js"
import { replyPreview, type Harness } from "./harness.js"

/** How a harness reads one line of its transcript as items. */
export type Items = NonNullable<Harness["transcripts"]>["items"]

/**
 * The start of what the agent said last since the person's latest prompt, as its
 * transcript records it, through its harness's items: undefined when it said nothing
 * since, or the transcript can't be read. Only its tail is read.
 */
export const lastReply = async (path: string, items: Items): Promise<string | undefined> => {
  const lines = await tailLines(path)
  let reply: string | undefined
  for (const line of lines ?? [])
    for (const { role, kind, text } of items(line)) {
      if (role === "user") reply = undefined
      else if (role === "assistant" && kind === "text" && text.trim()) reply = text
    }
  return replyPreview(reply)
}

/**
 * Where among one hook's facts a root turn's end names no reply that its transcript may
 * hold: one the turn ended on its own, as the hook told it; -1 for none. An end the
 * person interrupted, or one told by records, reads nothing.
 */
export const unreplied = (events: readonly HarnessEvent[]): number =>
  events.findIndex(
    (event) =>
      event.type === "turn-ended" &&
      !event.recorded &&
      event.reply === undefined &&
      event.outcome !== "interrupted",
  )

/**
 * The facts of one hook's report, a root turn's end given the start of the agent's last
 * reply where the hook named none (`unreplied`), from the transcript the same report
 * names, as Antigravity's Stop names none.
 */
export const withReplies = async (
  events: readonly HarnessEvent[],
  items: Items | undefined,
  read: typeof lastReply = lastReply,
): Promise<readonly HarnessEvent[]> => {
  const index = unreplied(events)
  const named = events.find((event) => event.type === "session-observed" && event.transcript)
  const transcript = named?.type === "session-observed" ? named.transcript : undefined
  if (index < 0 || !items || !transcript) return events
  const reply = await read(transcript, items)
  if (reply === undefined) return events
  return events.map((event, at) =>
    at === index && event.type === "turn-ended" ? { ...event, reply } : event,
  )
}
