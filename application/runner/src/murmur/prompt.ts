// What the model is told. It is a 2B model reading a few kilobytes: the prompt is short,
// the person's current ask comes last where it weighs most, and every rule is one the
// model was seen to break without it (see docs/murmur.md).
import type { Digest } from "./describer.js"
import { summaryCharacters, summarySentences, titleCharacters, titleWords } from "./description.js"

export type Message = { readonly role: "system" | "user"; readonly content: string }

export const system = `You label terminals in a developer's sidebar. You get what one terminal shows: an AI coding agent's session, or a plain shell. Reply with a JSON object holding a title and a summary.

title: ${titleWords.min} to ${titleWords.max} words, at most ${titleCharacters} characters, naming the concrete task or program. Write it like a tab name: no verb needed, no full sentence, never a raw command line.
summary: at most ${summaryCharacters} characters and at most ${summarySentences} sentences saying what the terminal is doing right now (working, waiting for the person, finished, failed) and on what. Start with the activity itself; never begin with "The agent" or "The terminal".

Rules:
- Write the title and the summary in the language of the person's CURRENT prompt, whatever language these instructions are in. For a plain shell, write English.
- Describe the CURRENT prompt, the last one, even when earlier prompts or the agent's reply are about something else. Earlier prompts are only background.
- A previous label may be given. Keep its title word for word unless the work has clearly moved on to something else. Always refresh the summary.
- Use only facts in the text. Never guess a cause, and never say something failed unless it plainly says so.
- A shell that tails logs, watches files or serves something is running it, not failing, even when the lines it shows contain errors.
- Use no markdown and no quotation marks.

Examples of the reply, by the language of the prompt:
Prompt "add retry to the upload client" gives:
{"title":"Upload client retries","summary":"Adding retry with backoff to the upload client in the api package. Waiting for the next instruction."}
Prompt "dodaj walidację formularza rejestracji" gives:
{"title":"Walidacja formularza rejestracji","summary":"Dodaje walidację pól w formularzu rejestracji i czeka na uwagi."}
Prompt "sprawdź, dlaczego testy się wywalają" gives:
{"title":"Awaria testów","summary":"Szuka przyczyny niepowodzenia testów w pakiecie runner."}
A shell running tail -f app.log gives:
{"title":"Tailing the app log","summary":"Following app.log, which shows a few connection errors, while the process keeps running."}`

/** The schema for `response_format`, which keeps the reply to the two fields. */
export const schema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary"],
  properties: {
    title: { type: "string", minLength: 3, maxLength: titleCharacters },
    summary: { type: "string", minLength: 1, maxLength: summaryCharacters },
  },
} as const

export const responseFormat = {
  type: "json_schema",
  json_schema: { name: "terminal_label", strict: true, schema },
} as const

// Rough budgets in characters, to keep a job inside the model's 4096-token window. The
// terminals side already trims; this is the last guard.
const budget = { earlier: 240, earlierCount: 3, current: 800, reply: 900, row: 160, rows: 30 }

const head = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`
const tail = (text: string, limit: number): string =>
  text.length <= limit ? text : `…${text.slice(text.length - limit + 1).trimStart()}`

const fact = (name: string, value: string | null): string[] =>
  value === null || value.trim() === "" ? [] : [`${name}: ${value.trim()}`]

const previous = (digest: Digest): string[] =>
  digest.previous === null
    ? []
    : [
        "",
        "Previous label (keep its title unless the work clearly changed):",
        `title: ${digest.previous.title}`,
        `summary: ${digest.previous.summary}`,
      ]

/** The chat that asks the model to label `digest`; the digest should already be redacted. */
export const messages = (digest: Digest): Message[] => {
  const lines: string[] = []
  if (digest.kind === "agent") {
    lines.push(`Terminal: a ${digest.harness} agent session`)
    lines.push(...fact("Project", digest.project), ...fact("Folder", digest.folder))
    lines.push(...fact("Git branch", digest.branch), ...fact("Plan", digest.plan))
    if (digest.folders.length > 0) lines.push(`Writes mostly in: ${digest.folders.join(", ")}`)
    const asked = digest.prompts.filter((prompt) => prompt.trim() !== "")
    const current = asked.at(-1)
    const earlier = asked.slice(0, -1).slice(-budget.earlierCount)
    if (earlier.length > 0) {
      lines.push("", "Earlier prompts from the person (background only, oldest first):")
      for (const prompt of earlier) lines.push(`- ${head(prompt.trim(), budget.earlier)}`)
    }
    if (digest.reply !== null && digest.reply.trim() !== "") {
      lines.push("", "The agent's latest reply, its end:", tail(digest.reply.trim(), budget.reply))
    }
    lines.push(...previous(digest))
    lines.push("", "CURRENT prompt from the person (label this, in its language):")
    lines.push(current === undefined ? "(none yet)" : head(current.trim(), budget.current))
    lines.push("", "Write the title and summary in the language of the CURRENT prompt above.")
  } else {
    lines.push("Terminal: a plain shell")
    lines.push(...fact("Project", digest.project), ...fact("Folder", digest.folder))
    lines.push(...fact("Running", digest.command))
    const screen = digest.screen.slice(-budget.rows).map((row) => head(row, budget.row))
    lines.push("", "What the screen shows now (oldest row first):", ...screen)
    lines.push(...previous(digest))
    lines.push("", "Label this terminal as it is now.")
  }
  return [
    { role: "system", content: system },
    { role: "user", content: lines.join("\n") },
  ]
}
