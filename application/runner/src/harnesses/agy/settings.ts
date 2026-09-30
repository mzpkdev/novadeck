import { readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import type { Install } from "../harness.js"

/**
 * Antigravity takes its status line only from its user settings, so connecting it puts
 * NovaDeck's there: in NovaDeck's shells it hands the snapshot to NovaDeck's hook, and
 * everywhere it then runs the person's own, which it names. Disconnecting puts theirs back.
 * Antigravity itself rewrites this file, so every change reads it afresh and replaces it
 * whole; one it cannot parse is left as it is. Windows keeps the person's own until the
 * command is proven there.
 */

// What marks a status line as NovaDeck's.
const marker = '"$NOVADECK_HOOK" agy StatusLine'

// A value sh reads back as the same string.
const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`

/** NovaDeck's status line, running `own` after it with the same input. */
export const statusLineCommand = (own: string | undefined): string =>
  [
    "novadeck_input=$(cat)",
    `if [ -n "$NOVADECK_HOOK" ]; then printf '%s' "$novadeck_input" | ${marker} >/dev/null 2>&1; fi`,
    ...(own ? [`printf '%s' "$novadeck_input" | sh -c ${quote(own)}`] : []),
  ].join("; ")

type Settings = { [key: string]: unknown; statusLine?: unknown }

/** Where the person's own status line waits while NovaDeck's is in place. */
export const ownStatusLineFile = (install: Install): string =>
  join(dirname(install.plugin), "statusline-own.json")

const settingsFile = (home: string): string => join(home, "settings.json")

const ours = (line: unknown): boolean => {
  const command =
    typeof line === "object" && line !== null ? (line as { command?: unknown }).command : undefined
  return typeof command === "string" && command.includes(marker)
}

const ownCommand = (line: object | null): string | undefined => {
  const command = (line as { type?: unknown; command?: unknown } | null) ?? {}
  return command.type === "command" && typeof command.command === "string" && command.command
    ? command.command
    : undefined
}

const read = async (file: string): Promise<Settings> => {
  let text: string
  try {
    text = await readFile(file, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw error
  }
  let settings: unknown
  try {
    settings = JSON.parse(text)
  } catch {
    throw new Error(`${file} is not valid JSON. Repair it, then connect Antigravity again.`)
  }
  if (typeof settings !== "object" || settings === null || Array.isArray(settings))
    throw new Error(`${file} does not hold settings. Repair it, then connect Antigravity again.`)
  return settings as Settings
}

// Replaces the file whole, so Antigravity reads the old settings or the new.
const write = async (file: string, value: unknown): Promise<void> => {
  const temporary = `${file}.${process.pid}.novadeck`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, file)
}

export const statusLineSettings = (home: (install: Install) => string) => ({
  apply: async (install: Install): Promise<void> => {
    if (install.platform === "win32") return
    const file = settingsFile(home(install))
    const settings = await read(file)
    const current = settings.statusLine
    if (ours(current)) return
    const own = typeof current === "object" && current !== null ? current : null
    await write(ownStatusLineFile(install), own)
    // The person's display choices stay; without a status line of their own, Antigravity's
    // default keeps showing above NovaDeck's, which prints nothing.
    settings.statusLine = {
      ...(own ?? { enabled: true, stack_with_default: true }),
      type: "command",
      command: statusLineCommand(ownCommand(own)),
    }
    await write(file, settings)
  },
  revert: async (install: Install): Promise<void> => {
    const file = settingsFile(home(install))
    const saved = ownStatusLineFile(install)
    const settings = await read(file)
    if (ours(settings.statusLine)) {
      const own = await readFile(saved, "utf8").then(
        (text) => JSON.parse(text) as unknown,
        () => null,
      )
      if (typeof own === "object" && own !== null) settings.statusLine = own
      else delete settings.statusLine
      await write(file, settings)
    }
    await rm(saved, { force: true })
  },
})
