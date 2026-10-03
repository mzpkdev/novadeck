import { readFile, writeFile } from "node:fs/promises"

import type { IpcMainEvent } from "electron"

import { appearanceChannel } from "../bridge.js"

/**
 * How the page looks, as the window follows it: the scheme for `nativeTheme.themeSource`
 * (`system` while the page follows the system) and the ground the window shows before
 * the page paints.
 */
export type WindowAppearance = {
  readonly scheme: "system" | "light" | "dark"
  readonly ground: string
}

const schemes: ReadonlySet<string> = new Set(["system", "light", "dark"])
const groundPattern = /^#[0-9a-f]{6}$/

/**
 * The page's report when it is one, or undefined. The page is not trusted with more: a
 * known scheme and an opaque `#rrggbb` colour pass, and nothing else of the value does.
 */
export const windowAppearanceOf = (value: unknown): WindowAppearance | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  const { scheme, ground } = value as Record<string, unknown>
  if (typeof scheme !== "string" || !schemes.has(scheme)) return undefined
  if (typeof ground !== "string" || !groundPattern.test(ground.toLowerCase())) return undefined
  return { scheme: scheme as WindowAppearance["scheme"], ground: ground.toLowerCase() }
}

type Files = {
  readFile(path: string, encoding: "utf8"): Promise<string>
  writeFile(path: string, data: string): Promise<void>
}

/**
 * The last appearance the page reported, kept in `file` so the next launch opens its
 * windows on that ground. Saves run one after another, so the last report is the one
 * kept.
 */
export const keepAppearance = (file: string, files: Files = { readFile, writeFile }) => {
  let last: WindowAppearance | undefined
  let saving: Promise<void> = Promise.resolve()
  return {
    /** Reads what the last launch kept; nothing when it kept nothing usable. */
    load: async (): Promise<WindowAppearance | undefined> => {
      try {
        last = windowAppearanceOf(JSON.parse(await files.readFile(file, "utf8")))
      } catch {
        last = undefined
      }
      return last
    },
    current: (): WindowAppearance | undefined => last,
    save: (next: WindowAppearance): Promise<void> => {
      if (last?.scheme === next.scheme && last.ground === next.ground) return saving
      last = next
      saving = saving
        .then(() => files.writeFile(file, JSON.stringify(next)))
        .catch(() => {
          // The window still follows the page; the next launch opens on the old ground.
        })
      return saving
    },
  }
}

type AppearanceIpc = {
  on(channel: string, listener: (event: IpcMainEvent, value: unknown) => void): unknown
}

/**
 * Follows the page's appearance reports. `window` names the window of a report from the
 * app's own page, or undefined for any other sender, whose reports are dropped, as are
 * reports that are not a valid appearance.
 */
export const registerAppearanceIpc = <Window>(
  ipc: AppearanceIpc,
  {
    window,
    show,
  }: {
    readonly window: (event: IpcMainEvent) => Window | undefined
    readonly show: (window: Window, appearance: WindowAppearance) => void
  },
): void => {
  ipc.on(appearanceChannel, (event, value) => {
    const target = window(event)
    const appearance = windowAppearanceOf(value)
    if (target === undefined || !appearance) return
    show(target, appearance)
  })
}
