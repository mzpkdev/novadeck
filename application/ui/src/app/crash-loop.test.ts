import { createStore } from "../model/store"
import { describe, expect, it } from "../test"
import { openCommands } from "../test/commands"
import { watchCrashLoop } from "./ui-store"

describe("crash loop episodes", () => {
  it("forget Not now once the crash loop ends, so the next one asks again", () => {
    const crashes = createStore(4)
    const app = openCommands()
    const stop = watchCrashLoop(crashes, app.ui)
    app.commands.dismissCrashLoop()
    crashes.update(() => 5)
    expect(app.ui.getSnapshot().crashLoopDismissed).toBe(true)
    crashes.update(() => 0)
    expect(app.ui.getSnapshot().crashLoopDismissed).toBe(false)
    stop()
  })
})
