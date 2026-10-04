import { Pause } from "lucide-react"

import type { MailBadge } from "../../model/messages"
import { slotIcon } from "./artifact-icons"
import { isNew, type BarSlot } from "./bar"

// What a terminal's companion bar holds, on its sidebar tab's name line: an icon for each
// icon on the bar, in the bar's order. Something new is drawn whole with a dot; the
// messages carry the count waiting for the agent, amber while a thread waits for its
// release, and a pause mark while messaging is paused; what's been seen stays faint. The
// tab's description says the same in words.
export const TabKinds = ({
  slots,
  mail,
}: {
  slots: readonly BarSlot[]
  mail: MailBadge | null
}): React.JSX.Element => (
  <span aria-hidden className="terminal-tab-kinds">
    {slots.map((slot) => {
      const messages = !slot.stack && slot.members[0]!.kind === "messages"
      const Icon = messages && mail?.kind === "paused" ? Pause : slotIcon(slot)
      const state = messages ? (mail?.kind ?? "seen") : slot.members.some(isNew) ? "new" : "seen"
      return (
        <span key={slot.key} className="terminal-tab-kind" data-state={state}>
          <Icon size={12} strokeWidth={1.75} />
          {messages && mail && <b className="terminal-tab-kind-count">{mail.count}</b>}
        </span>
      )
    })}
  </span>
)
