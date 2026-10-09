import type { Unread } from "../../terminals/unread-state"
import { context, describe, expect, it } from "../../test"
import { openCommands } from "../../test/commands"

// Two session contexts with finishes the person hasn't read.
const unread: Unread = {
  "project/initial": { "01": "done", "02": "failed" },
  "project/other": { "09": "done" },
}

const unreadApp = () => {
  const app = openCommands()
  app.ui.update((state) => ({ ...state, unread }))
  return app
}

describe("Notification commands", () => {
  context("when the person dismisses a finish", () => {
    it("reads that terminal only", () => {
      const app = unreadApp()
      app.commands.dismissNotification("project/initial", "02")
      expect(app.ui.getSnapshot().unread).toEqual({
        "project/initial": { "01": "done" },
        "project/other": { "09": "done" },
      })
    })

    it("leaves the state as it was for one already read", () => {
      const app = unreadApp()
      app.commands.dismissNotification("project/initial", "07")
      expect(app.ui.getSnapshot().unread).toBe(unread)
    })
  })

  context("when the person marks all read", () => {
    it("clears every finish in every session", () => {
      const app = unreadApp()
      app.commands.dismissAllNotifications()
      expect(app.ui.getSnapshot().unread).toEqual({})
    })
  })
})
