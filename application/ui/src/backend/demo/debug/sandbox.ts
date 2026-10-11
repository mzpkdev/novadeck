import type { SandboxState } from "../../../model/sandbox"

// The command the demo's unsandboxed notice offers, as the desktop host's might read.
export const sampleFix = "sudo apparmor_parser -r /etc/apparmor.d/novadeck"

// The browser's stand-in for the desktop host's account of its sandbox, asked once.
export const createDemoSandbox =
  (state: SandboxState): (() => Promise<SandboxState>) =>
  () =>
    Promise.resolve(state)
