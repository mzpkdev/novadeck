import { afterEach, vi } from "vitest"

import { describe, expect, it } from "../../../test"
import { createDemoUninstall, sampleLeftover, uninstallMs } from "./uninstall"

afterEach(() => {
  vi.useRealTimers()
})

describe("demo uninstall", () => {
  it("says what it would do, and ends every run as armed", async () => {
    vi.useFakeTimers()
    const plan = { kind: "ready", dataFolders: ["/data"], handoff: "app" } as const
    const { uninstall, runs, quits } = createDemoUninstall({
      plan,
      result: { kind: "removed", leftover: sampleLeftover },
    })
    expect(await uninstall.plan()).toEqual(plan)
    const run = uninstall.run({ keepData: false })
    await vi.advanceTimersByTimeAsync(uninstallMs)
    expect(await run).toEqual({ kind: "removed", leftover: sampleLeftover })
    expect(runs()).toEqual([false])
    uninstall.quit()
    expect(quits()).toBe(1)
  })
})
