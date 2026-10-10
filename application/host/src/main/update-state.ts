import { randomUUID } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { readFile, rename, rm, writeFile } from "node:fs/promises"

import { updateChannels, type UpdateChannel } from "@novadeck/protocol/bridge"

/** What the host remembers across launches about updating. */
export type UpdateState = {
  /** Which releases the build follows. */
  readonly channel: UpdateChannel
  /**
   * The version of the build that failed to install an update, when one did: that
   * version only tells of updates from then on, and a newer build ignores the mark.
   */
  readonly installFailedOn: string | undefined
  /** Whether the person asked not to be offered a move to the Applications folder again. */
  readonly moveDeclined: boolean
}

const defaults: UpdateState = { channel: "stable", installFailedOn: undefined, moveDeclined: false }

/**
 * The state in a file's text. The file is the host's own, but a damaged or edited one
 * must not break launching, so each field that is not a known value falls back to its
 * default on its own.
 */
export const updateStateOf = (text: string): UpdateState => {
  let kept: unknown
  try {
    kept = JSON.parse(text)
  } catch {
    return defaults
  }
  if (typeof kept !== "object" || kept === null) return defaults
  const { channel, installFailedOn, moveDeclined } = kept as Record<string, unknown>
  return {
    channel: updateChannels.find((known) => known === channel) ?? defaults.channel,
    installFailedOn: typeof installFailedOn === "string" ? installFailedOn : undefined,
    moveDeclined: moveDeclined === true,
  }
}

/**
 * The update state kept in `file`, a JSON file in the data folder. `read` is what the
 * file holds, or the defaults before it exists. Each change keeps the other fields and
 * writes a temporary file beside `file` that it renames over, so a failed write leaves
 * the file whole; changes run one after another.
 */
export const keepUpdateState = (file: string) => {
  let writing: Promise<void> = Promise.resolve()
  const read = async (): Promise<UpdateState> =>
    readFile(file, "utf8").then(updateStateOf, () => defaults)
  const change = (patch: Partial<UpdateState>): Promise<void> => {
    const next = writing
      .catch(() => {})
      .then(async () => {
        const temporary = `${file}.${randomUUID()}.tmp`
        try {
          await writeFile(temporary, JSON.stringify({ ...(await read()), ...patch }))
          await rename(temporary, file)
        } catch (error) {
          await rm(temporary, { force: true })
          throw error
        }
      })
    writing = next
    return next
  }
  return {
    read,
    setChannel: (channel: UpdateChannel): Promise<void> => change({ channel }),
    declineMove: (): Promise<void> => change({ moveDeclined: true }),
    /**
     * Marks that installing failed on `version`. It writes synchronously: a failed install
     * on quit is reported as the app exits, too late for a write that waits.
     */
    recordInstallFailure: (version: string): void => {
      let current = defaults
      try {
        current = updateStateOf(readFileSync(file, "utf8"))
      } catch {
        // Nothing kept yet.
      }
      writeFileSync(file, JSON.stringify({ ...current, installFailedOn: version }))
    },
  }
}
