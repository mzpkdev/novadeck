import { useSyncExternalStore } from "react"

import { companionKeyId, type CompanionKey } from "../../model/companion"
import {
  hasMail,
  mailBadge,
  type MailBadge,
  type MailState,
  type Messages,
  type TerminalMail,
} from "../../model/messages"
import type { Store } from "../../model/store"

// A terminal's messages as its companion pane uses them.
export type MailHandle = {
  readonly mail: TerminalMail | undefined
  readonly paused: boolean
  // Whether the terminal has a messages view: an agent is there, or it had messages.
  readonly present: boolean
  readonly badge: MailBadge | null
  readonly pause: (paused: boolean) => void
  readonly release: (thread: string) => void
}

const nothing: MailState = { paused: false, terminals: {} }
const noMail: Store<MailState> = { getSnapshot: () => nothing, subscribe: () => () => {} }

export const useMail = (messages: Messages | undefined, key: CompanionKey): MailHandle => {
  const store = messages?.state ?? noMail
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const mail = state.terminals[companionKeyId(key)]
  return {
    mail,
    paused: state.paused,
    present: hasMail(mail),
    badge: mailBadge(mail, state.paused),
    pause: (paused) => messages?.pause(paused),
    release: (thread) => messages?.release(key, thread),
  }
}
