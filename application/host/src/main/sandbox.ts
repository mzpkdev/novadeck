import type { SandboxState } from "@novadeck/protocol/bridge"
import type { IpcMainInvokeEvent } from "electron"

import { sandboxChannel } from "../bridge.js"
import type { ReleaseRepository } from "./update-release.js"

/**
 * The command that turns the sandbox on for an existing install: it runs the installer
 * of the latest release in its `--sandbox` mode, which writes only the AppArmor profile
 * Electron's sandbox needs on Linux distributions that restrict unprivileged user
 * namespaces. Undefined where there is none to offer: off Linux, and without a release
 * repository, as in a development run.
 */
export const sandboxFix = (
  platform: NodeJS.Platform,
  repository: ReleaseRepository | undefined,
): string | undefined =>
  platform === "linux" && repository
    ? `curl -fsSL https://github.com/${repository.owner}/${repository.repo}/releases/latest/download/install.sh | sh -s -- --sandbox`
    : undefined

/**
 * Whether Electron's sandbox is on. It is off when Electron was started with
 * `--no-sandbox`, as the AppImage launcher does when the system refuses it an
 * unprivileged user namespace. The `fix` is empty when there is no command to offer; see
 * `sandboxFix`.
 */
export const sandboxState = (
  disabled: boolean,
  platform: NodeJS.Platform,
  repository: ReleaseRepository | undefined,
): SandboxState =>
  disabled ? { sandboxed: false, fix: sandboxFix(platform, repository) ?? "" } : { sandboxed: true }

type SandboxIpc = {
  handle(channel: string, listener: (event: IpcMainInvokeEvent) => unknown): unknown
}

/**
 * Answers the app's own pages whether the sandbox is on. `window` names the window of a
 * request from the main frame of the app's own page, or undefined for any other sender,
 * which is told the sandbox is on, as it may learn nothing. The request carries no value.
 */
export const registerSandboxIpc = <Window>(
  ipc: SandboxIpc,
  {
    window,
    state,
  }: {
    readonly window: (event: IpcMainInvokeEvent) => Window | undefined
    readonly state: () => Promise<SandboxState>
  },
): void => {
  ipc.handle(sandboxChannel, (event) =>
    window(event) === undefined ? { sandboxed: true } : state(),
  )
}
