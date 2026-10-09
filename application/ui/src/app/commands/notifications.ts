import { clearUnread } from "../../terminals/unread-state"
import type { CommandContext } from "./context"

export type NotificationCommands = {
  // Reads a finish in the notification center: the terminal's unread turn end, in the
  // session context that holds it, is cleared. A request waits until its agent is answered.
  readonly dismissNotification: (context: string, terminalId: string) => void
  // Reads the finishes the panel lists, and no mark it doesn't show.
  readonly dismissAllNotifications: (
    shown: readonly { readonly context: string; readonly terminalId: string }[],
  ) => void
}

export const createNotificationCommands = ({
  ui,
}: Pick<CommandContext, "ui">): NotificationCommands => ({
  dismissNotification: (context, terminalId) =>
    void ui.update((state) => {
      const unread = clearUnread(state.unread, context, terminalId)
      return unread === state.unread ? state : { ...state, unread }
    }),
  dismissAllNotifications: (shown) =>
    void ui.update((state) => {
      const unread = shown.reduce(
        (left, { context, terminalId }) => clearUnread(left, context, terminalId),
        state.unread,
      )
      return unread === state.unread ? state : { ...state, unread }
    }),
})
