import type { UninstallPlan, UninstallResult } from "../../../model/uninstall"
import type { Backend } from "../../port"
import type { DemoActionGroup } from "./types"
import type { DemoLaunch } from "./with-debug"

// An uninstall as the demo plays one: what the host says it would do, and how running it
// ends.
export type DemoUninstall = {
  readonly plan: UninstallPlan
  readonly result: UninstallResult
}

// Long enough to see Removing….
export const uninstallMs = 1500

// The command a Homebrew copy is removed with, and the one the host leaves for the person.
export const sampleBrewCommand = "brew uninstall --cask novadeck"
export const sampleLeftover = "sudo rm /etc/apparmor.d/novadeck"

const dataFolders = ["/home/mzpk/.config/novadeck", "/home/mzpk/Novadeck"] as const

// The browser's stand-in for the desktop host's uninstall: it says what it would do, and
// every run ends as armed after a moment. `runs` records the `keepData` of each run and
// `quits` counts the presses of Quit, since a browser has no app to remove or quit.
export const createDemoUninstall = ({
  plan,
  result,
}: DemoUninstall): {
  readonly uninstall: NonNullable<Backend["uninstall"]>
  readonly runs: () => readonly boolean[]
  readonly quits: () => number
} => {
  const runs: boolean[] = []
  let quits = 0
  return {
    uninstall: {
      plan: () => Promise.resolve(plan),
      run: ({ keepData }) => {
        runs.push(keepData)
        return new Promise((resolve) => setTimeout(() => resolve(result), uninstallMs))
      },
      quit: () => void (quits += 1),
    },
    runs: () => runs,
    quits: () => quits,
  }
}

const ready = (
  handoff: "app" | "uninstaller",
  folders: readonly string[] = dataFolders,
): UninstallPlan => ({
  kind: "ready",
  dataFolders: folders,
  handoff,
})

// The uninstalls the demo plays, by the name a spec asks for in the address (`?uninstall=`).
export const uninstallScenarios = {
  unavailable: { plan: { kind: "unavailable" }, result: { kind: "removed" } },
  manual: { plan: { kind: "manual", command: sampleBrewCommand }, result: { kind: "removed" } },
  removed: { plan: ready("app"), result: { kind: "removed" } },
  "no-data": { plan: ready("app", []), result: { kind: "removed" } },
  leftover: { plan: ready("app"), result: { kind: "removed", leftover: sampleLeftover } },
  failed: {
    plan: ready("app"),
    result: { kind: "failed", reason: "Novadeck is in a folder you can't change." },
  },
  windows: { plan: ready("uninstaller"), result: { kind: "uninstalling" } },
  "windows-failed": {
    plan: ready("uninstaller"),
    result: { kind: "failed", reason: "Windows couldn't start the uninstaller." },
  },
} as const satisfies Record<string, DemoUninstall>

// The panel's group for uninstalling the app. Each action boots the demo again as a host
// that offers it, with the end of a run armed. The dialog names the agents connected in
// Preferences, and Agents > Fail next change makes a disconnect fail before the run.
export const uninstallGroup = (launch: DemoLaunch): DemoActionGroup => {
  const boot = (name: keyof typeof uninstallScenarios | undefined) => () =>
    launch.setUninstall(name && uninstallScenarios[name])
  return {
    section: "App",
    title: "Uninstall",
    actions: [
      {
        label: "Not offered",
        hint: "Preferences > About has no Uninstall row (portable copy, development)",
        reboots: true,
        run: boot(undefined),
      },
      {
        label: "Homebrew copy",
        hint: "About shows the brew command with Copy, no button",
        reboots: true,
        run: boot("manual"),
      },
      {
        label: "Removed",
        hint: "Uninstall… dialog, Removing…, then Novadeck is uninstalled and Quit",
        reboots: true,
        run: boot("removed"),
      },
      {
        label: "Ready, no data folder",
        hint: "Dialog has no Keep my projects checkbox (custom user-data dir)",
        reboots: true,
        run: boot("no-data"),
      },
      {
        label: "Removed, leftover",
        hint: "Ends on uninstalled, with a command to copy",
        reboots: true,
        run: boot("leftover"),
      },
      {
        label: "Removal fails",
        hint: "Dialog stays open with the reason; Uninstall retries",
        reboots: true,
        run: boot("failed"),
      },
      {
        label: "Windows uninstaller",
        hint: "Dialog button reads Continue; ends on closing for its uninstaller",
        reboots: true,
        run: boot("windows"),
      },
      {
        label: "Windows uninstaller fails",
        hint: "Continue ends in the reason, dialog stays open",
        reboots: true,
        run: boot("windows-failed"),
      },
    ],
  }
}
