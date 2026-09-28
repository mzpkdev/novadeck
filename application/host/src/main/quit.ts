import type { IpcMainEvent } from "electron"

import { saveBeforeQuitChannel } from "../bridge.js"

type QuitIpc = {
  on(channel: string, listener: (event: IpcMainEvent) => void): unknown
  removeListener(channel: string, listener: (event: IpcMainEvent) => void): unknown
}

type Page = { send(channel: string): void }

/**
 * Asks each page to finish its saves while the runner's shells still run, so the saved
 * sessions name the programs in them. Resolves once every page answered, or after
 * `timeoutMs`, so a hung page cannot hold quitting up. `sender` names the page an
 * answer came from, or undefined for one that is not the app's own.
 */
export const savePages = (
  ipc: QuitIpc,
  pages: readonly Page[],
  {
    sender,
    timeoutMs,
  }: { readonly sender: (event: IpcMainEvent) => Page | undefined; readonly timeoutMs: number },
): Promise<void> =>
  new Promise((resolve) => {
    const waiting = new Set(pages)
    const done = (): void => {
      clearTimeout(timer)
      ipc.removeListener(saveBeforeQuitChannel, answered)
      resolve()
    }
    const answered = (event: IpcMainEvent): void => {
      const page = sender(event)
      if (page) waiting.delete(page)
      if (waiting.size === 0) done()
    }
    const timer = setTimeout(done, timeoutMs)
    if (waiting.size === 0) {
      done()
      return
    }
    ipc.on(saveBeforeQuitChannel, answered)
    for (const page of pages) page.send(saveBeforeQuitChannel)
  })
