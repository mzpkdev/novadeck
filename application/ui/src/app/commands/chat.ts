import {
  chatAvailable,
  chatModeOn,
  chatDraftOf,
  setChatDraft,
  setChatMode,
} from "../../terminals/chat/mode-state"
import { currentContext, currentState } from "../selectors"
import type { CommandContext } from "./context"
import { shellEdits } from "./shell"

// A terminal's agent shows as a conversation or as the terminal's screen. Either way
// typing goes where the person now looks: the chat's box, or the terminal.
export type ChatCommands = {
  // Flips the terminal between its screen and its agent's chat. Does nothing for a
  // terminal no agent runs in, which has no chat.
  readonly toggleChat: (terminalId: string) => void
  // Shows the terminal's screen, as the person asks to answer the agent there.
  readonly showTerminal: (terminalId: string) => void
  // Keeps what the person has typed in the terminal's chat and not sent.
  readonly setChatDraft: (terminalId: string, text: string) => void
  // Clears the draft a prompt was sent from, in the session it was sent in, if the person
  // hasn't changed it since: whether or not the chat is still on screen.
  readonly clearChatDraft: (context: string, terminalId: string, sent: string) => void
}

export const createChatCommands = (ctx: CommandContext): ChatCommands => {
  const { workspace, ui, navigation } = ctx
  const { set } = shellEdits(ctx)
  const show = (terminalId: string, on: boolean): void => {
    const snapshot = workspace.getSnapshot()
    const { roster, view } = currentState(snapshot)
    const terminal = roster.terminals.find((each) => each.id === terminalId)
    if (!terminal || (on && !chatAvailable(terminal))) return
    const context = currentContext(snapshot)
    ui.update((state) => {
      const chat = setChatMode(state.chat, context, terminalId, on)
      return chat === state.chat ? state : { ...state, chat }
    })
    // Where the person now types: the surface or the chat takes keyboard focus.
    navigation.go({ terminal: terminalId })
    set("keyboardFocus", { id: terminalId, view })
  }
  return {
    toggleChat: (terminalId) => {
      const context = currentContext(workspace.getSnapshot())
      show(terminalId, !chatModeOn(ui.getSnapshot().chat, context, terminalId))
    },
    showTerminal: (terminalId) => show(terminalId, false),
    setChatDraft: (terminalId, text) => {
      const context = currentContext(workspace.getSnapshot())
      ui.update((state) => {
        const chatDrafts = setChatDraft(state.chatDrafts, context, terminalId, text)
        return chatDrafts === state.chatDrafts ? state : { ...state, chatDrafts }
      })
    },
    clearChatDraft: (context, terminalId, sent) =>
      void ui.update((state) =>
        chatDraftOf(state.chatDrafts, context, terminalId).trim() === sent.trim()
          ? { ...state, chatDrafts: setChatDraft(state.chatDrafts, context, terminalId, "") }
          : state,
      ),
  }
}
