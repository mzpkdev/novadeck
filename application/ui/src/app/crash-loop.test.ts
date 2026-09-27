import { createStore } from "../model/store"
import { describe, expect, it } from "../test"
import { openCommands } from "../test/commands"
import { keyState } from "./commands/keys"
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

describe("the crash-loop dialog and the keyboard", () => {
  it("holds shortcuts back while the dialog asks, and lets them through after Not now", () => {
    const crashes = createStore(0)
    const app = openCommands()
    const stop = watchCrashLoop(crashes, app.ui)
    expect(keyState(app.context, app.commands).alert).toBe(false)
    crashes.update(() => 4)
    expect(keyState(app.context, app.commands).alert).toBe(true)
    app.commands.dismissCrashLoop()
    expect(keyState(app.context, app.commands).alert).toBe(false)
    stop()
  })
})
