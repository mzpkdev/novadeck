import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react"

import type { TerminalKey } from "../../backend/port"
import type { TerminalMetadata, Workspace } from "../../model/types"
import { chatDraftOf, chatShown, setChatDraft } from "../../terminals/chat/mode-state"
import type { DictationControls } from "../../terminals/WindowShell"
import { isAgentTerminal } from "../../voice/agent-terminal"
import { startCapture } from "../../voice/capture"
import {
  createDictation,
  dictationKey,
  voiceClaimed,
  voiceReady,
  type DictationController,
} from "../../voice/dictation"
import { currentContext, currentState } from "../selectors"
import type { UiStore } from "../ui-store"
import { useWorkspaceServices, type WorkspaceServices } from "./context"
import { domEffects } from "./effects"

export const DictationContext = createContext<DictationController | undefined>(undefined)

// Where dictated words go: a terminal showing its agent's chat takes them in the chat's box,
// after what is there, for the person to send; any other takes them typed into it.
// `terminalOf` finds the terminal a key names, on a backend that reads conversations.
export const dictateInto =
  (
    ui: UiStore,
    typeInto: (key: TerminalKey, text: string) => boolean,
    terminalOf: (key: TerminalKey) => TerminalMetadata | undefined,
  ) =>
  (key: TerminalKey, text: string): boolean => {
    const context = `${key.projectId}/${key.workspaceSessionId}`
    const terminal = terminalOf(key)
    const { preferences, answering } = ui.getSnapshot()
    if (!terminal || !chatShown(preferences.chatView, answering, context, terminal))
      return typeInto(key, text)
    ui.update((state) => {
      const draft = chatDraftOf(state.chatDrafts, context, key.terminalId)
      const next =
        draft.trim() === "" ? text : /\s$/.test(draft) ? draft + text : `${draft} ${text}`
      return {
        ...state,
        chatDrafts: setChatDraft(state.chatDrafts, context, key.terminalId, next),
      }
    })
    return true
  }

// The terminal the person is at, whose change ends an offer made there.
const placeOf = (snapshot: Workspace): string =>
  `${currentContext(snapshot)}/${currentState(snapshot).selected}`

// Dictation for this App, once, where its backend transcribes and can type into a
// terminal; undefined where it can't. A hold in progress ends with the App.
export const useDictationController = ({
  backend,
  workspace,
  ui,
}: Pick<WorkspaceServices, "backend" | "workspace" | "ui">): DictationController | undefined => {
  const { voice, typeInto } = backend
  const controller = useMemo(
    () =>
      voice &&
      typeInto &&
      createDictation({
        voice,
        offered: () =>
          ui.update((state) =>
            state.addonOfferShown ? state : { ...state, addonOfferShown: true },
          ),
        typeInto: dictateInto(ui, typeInto, (key) =>
          backend.conversations
            ? workspace
                .getSnapshot()
                .projects.find((project) => project.id === key.projectId)
                ?.history.find((session) => session.id === key.workspaceSessionId)
                ?.state.roster.terminals.find((each) => each.id === key.terminalId)
            : undefined,
        ),
        startCapture,
        now: domEffects.now,
        after: domEffects.after,
      }),
    [voice, typeInto, backend.conversations, workspace, ui],
  )
  useEffect(() => () => controller?.dictation.cancel(), [controller])
  useEffect(() => controller?.start(), [controller])
  // An offer that is ignored goes: once the person types, or goes to another terminal.
  useEffect(() => {
    if (!controller) return undefined
    const typed = (event: KeyboardEvent): void => {
      const modifier = ["Control", "Shift", "Alt", "Meta", "AltGraph"].includes(event.key)
      // The shortcut itself, pressed again, turns voice input on.
      const chord = event.ctrlKey && event.shiftKey && event.code === "KeyM"
      if (!modifier && !chord) controller.setupActions.dismiss()
    }
    let place = placeOf(workspace.getSnapshot())
    const stopWorkspace = workspace.subscribe(() => {
      const next = placeOf(workspace.getSnapshot())
      if (next === place) return
      place = next
      controller.setupActions.dismiss()
    })
    window.addEventListener("keydown", typed, true)
    return () => {
      window.removeEventListener("keydown", typed, true)
      stopWorkspace()
    }
  }, [controller, workspace])
  return controller
}

const never = (): (() => void) => () => {}

// What a terminal's header needs for its mic button, or undefined where the button
// doesn't show: not an agent, no voice input on this machine, or the person turned it
// off or said no thanks. Until voice input is ready the button offers to install it.
export const useMicButton = (
  terminal: TerminalMetadata,
  key: TerminalKey,
): DictationControls | undefined => {
  const { backend } = useWorkspaceServices()
  const controller = useContext(DictationContext)
  const state = useSyncExternalStore(
    backend.voice?.state.subscribe ?? never,
    () => backend.voice?.state.getSnapshot() ?? null,
  )
  const view = useSyncExternalStore(
    controller?.view.subscribe ?? never,
    () => controller?.view.getSnapshot() ?? null,
  )
  if (!controller || !state || !voiceClaimed(state) || !isAgentTerminal(terminal)) return undefined
  if (!voiceReady(state))
    return { recording: false, ready: false, onToggle: () => controller.dictation.toggle(key) }
  return {
    recording:
      view?.phase === "recording" &&
      view.target !== null &&
      dictationKey(view.target) === dictationKey(key),
    onToggle: () => controller.dictation.toggle(key),
  }
}
