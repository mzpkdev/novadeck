import { clearUnread, noUnread } from "../../terminals/unread-state"
import type { CommandContext } from "./context"

export type NotificationCommands = {
  // Reads a finish in the notification center: the terminal's unread turn end, in the
  // session context that holds it, is cleared. A request waits until its agent is answered.
  readonly dismissNotification: (context: string, terminalId: string) => void
  // Reads every finish at once.
  readonly dismissAllNotifications: () => void
}

export const createNotificationCommands = ({
  ui,
}: Pick<CommandContext, "ui">): NotificationCommands => ({
  dismissNotification: (context, terminalId) =>
    void ui.update((state) => {
      const unread = clearUnread(state.unread, context, terminalId)
      return unread === state.unread ? state : { ...state, unread }
    }),
  dismissAllNotifications: () =>
    void ui.update((state) =>
      Object.keys(state.unread).length === 0 ? state : { ...state, unread: noUnread },
    ),
})
