import type { InstallResult, PortableState } from "@novadeck/protocol/bridge"
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron"

import { installAppChannel, openInstalledChannel, portableChannel } from "../bridge.js"
import { newerCopy, type InstalledCopy, type InstallOutcome } from "./install-linux.js"

/** What installing from a portable copy, and leaving for the installed one, ask of the app. */
export type PortableHost = {
  /** Whether this copy is portable; see `portableOf`. */
  readonly portable: boolean
  /** This build's version. */
  readonly version: string
  /** The running AppImage's file, which is what an install copies. */
  readonly source: string
  /** The AppImages already installed, with their versions. */
  readonly find: () => Promise<readonly InstalledCopy[]>
  /**
   * Installs the AppImage `source` over `target`, an installed copy, or at the installer's
   * own path when `target` is undefined.
   */
  readonly install: (source: string, target: string | undefined) => Promise<InstallOutcome>
  /** The shutdown quitting runs: pages save, the runner ends its shells. */
  readonly shutdown: () => Promise<void>
  /** Starts the AppImage `image` in place of this one and ends this process; false if it could not. */
  readonly start: (image: string) => boolean
  readonly quit: () => void
  readonly log: (message: string, error: unknown) => void
}

/** The page's view of a portable copy: what it is and what installing does. */
export type PortableInstaller = {
  readonly state: () => PortableState
  readonly install: () => Promise<InstallResult>
  readonly openInstalled: () => void
}

/**
 * Installs the app from a portable copy and leaves for it. `install` first looks at the
 * installed copies: one newer than this copy is left alone, since this copy would
 * replace it with an older app that could not open the data the newer one may have
 * upgraded, and the answer is `newer`, which `openInstalled` then acts on. Otherwise the
 * AppImage is installed from this very file, over the installed copy there is, else at
 * the installer's path, and the answer is `installing`: this copy
 * then shuts down as quitting does and starts the installed one, or quits should that
 * not start, as the shells are gone by then. A failed install says why and changes
 * nothing. A second request while one is under way, or after the copy began leaving,
 * answers `installing` and does nothing more. A copy that is not portable installs
 * nothing.
 */
export const portableInstaller = (host: PortableHost): PortableInstaller => {
  let under: Promise<InstallResult> | undefined
  let leaving = false
  let newer: string | undefined

  const leave = (image: string): void => {
    if (leaving) return
    leaving = true
    void host
      .shutdown()
      .catch((error: unknown) => host.log("Shutting down failed.", error))
      .then(() => (host.start(image) ? undefined : host.quit()))
      .catch(host.quit)
  }

  const run = async (): Promise<InstallResult> => {
    const copies = await host.find()
    const copy = newerCopy(copies, host.version)
    if (copy) {
      newer = copy.image
      return { kind: "newer", version: copy.version }
    }
    newer = undefined
    // An installed copy is replaced where it is, the installer's own before Homebrew's, so
    // no second copy appears; `find` lists them in that order.
    const outcome = await host.install(host.source, copies[0]?.image)
    if (outcome.kind === "failed") return outcome
    leave(outcome.image)
    return { kind: "installing" }
  }

  return {
    state: () => (host.portable ? { portable: true, version: host.version } : { portable: false }),
    install: () => {
      if (!host.portable)
        return Promise.resolve({ kind: "failed", reason: "This copy of Novadeck is installed." })
      if (leaving) return Promise.resolve({ kind: "installing" })
      under ??= run()
        .catch((error: unknown): InstallResult => {
          host.log("Installing failed.", error)
          return { kind: "failed", reason: "Installing failed." }
        })
        .finally(() => {
          under = undefined
        })
      return under
    },
    openInstalled: () => {
      if (newer !== undefined) leave(newer)
    },
  }
}

/** What a launch of a portable copy does about an installed copy that is newer. */
export type NewerInstalledCheck = {
  readonly portable: boolean
  readonly version: string
  readonly find: () => Promise<readonly InstalledCopy[]>
  /** Tells the person of the newer `version`; true if they want it opened, false to quit. */
  readonly ask: (version: string) => Promise<boolean>
  /** Starts the AppImage `image` in place of this one and ends this process; false if it could not. */
  readonly start: (image: string) => boolean
  /** Tells the person that the installed copy would not start. */
  readonly alert: () => Promise<void>
  readonly quit: () => void
  readonly log: (message: string, error: unknown) => void
}

/**
 * Before a portable copy starts anything, checks whether an installed copy is newer.
 * Then this copy must not run: the newer one may have upgraded the database, which an
 * older runner refuses to open, so the person is told and may open the installed copy,
 * or quit. Returns whether the launch is over, which it is when a newer copy exists,
 * whichever the person chooses, and not when none is found or the copies cannot be
 * listed; then the launch goes on.
 */
export const leaveForNewerInstalled = async (check: NewerInstalledCheck): Promise<boolean> => {
  if (!check.portable) return false
  let copy: ReturnType<typeof newerCopy>
  try {
    copy = newerCopy(await check.find(), check.version)
  } catch (error) {
    check.log("The installed copies could not be looked at.", error)
    return false
  }
  if (!copy) return false
  if (await check.ask(copy.version)) {
    if (check.start(copy.image)) return true
    await check.alert()
  }
  check.quit()
  return true
}

type PortableIpc = {
  on(channel: string, listener: (event: IpcMainEvent) => void): unknown
  handle(channel: string, listener: (event: IpcMainInvokeEvent) => unknown): unknown
}

/**
 * Answers the app's own pages whether this is a portable copy, and their requests to
 * install from it and to open the installed copy found newer. `window` names the window
 * of a request from the main frame of the app's own page, or undefined for any other
 * sender, which is told this is not a portable copy, may not install, and is ignored when
 * it asks to open. The requests carry no value.
 */
export const registerPortableIpc = <Window>(
  ipc: PortableIpc,
  {
    window,
    installer,
  }: {
    readonly window: (event: IpcMainEvent | IpcMainInvokeEvent) => Window | undefined
    readonly installer: PortableInstaller
  },
): void => {
  ipc.handle(portableChannel, (event): PortableState =>
    window(event) === undefined ? { portable: false } : installer.state(),
  )
  ipc.handle(installAppChannel, (event): Promise<InstallResult> | InstallResult =>
    window(event) === undefined
      ? { kind: "failed", reason: "Installing is not allowed from here." }
      : installer.install(),
  )
  ipc.on(openInstalledChannel, (event) => {
    if (window(event) !== undefined) installer.openInstalled()
  })
}
