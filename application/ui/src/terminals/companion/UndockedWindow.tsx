import { useMemo } from "react"

import type { ArtifactRef, CompanionKey, CompanionWindow, Companions } from "../../model/companion"
import type { Messages } from "../../model/messages"
import { ArtifactViewer } from "./ArtifactViewer"
import { PlanTab } from "./CompanionPane"
import { useMail } from "./mail"
import { MessagesView } from "./MessagesView"
import { mailTab, planTab, type Shown } from "./pane"
import { useArtifactContent, useCompanion } from "./state"

import "./companion.css"

const ArtifactContent = ({
  companions,
  origin,
  artifact,
}: {
  companions: Companions
  origin: CompanionKey
  artifact: ArtifactRef
}): React.JSX.Element => {
  const companion = useCompanion(companions, origin)
  const shown = useMemo<Shown>(() => ({ ...artifact, fresh: false, at: "" }), [artifact])
  return <ArtifactViewer artifact={shown} load={useArtifactContent(companion, shown)} />
}

const PlanContent = ({
  companions,
  origin,
  plan: ref,
}: {
  companions: Companions
  origin: CompanionKey
  plan: string
}): React.JSX.Element => {
  const companion = useCompanion(companions, origin)
  const plan = companion.pane.plans.find((each) => each.ref === ref)
  return (
    <section className="plan-reader" data-workspace-companion aria-label="Plan">
      {plan ? (
        <PlanTab key={`${plan.ref}:${plan.writable}`} companion={companion} plan={plan} />
      ) : (
        <div className="artifact-status">The agent no longer keeps this plan.</div>
      )}
    </section>
  )
}

const MessagesContent = ({
  messages,
  origin,
  peerName,
}: {
  messages: Messages
  origin: CompanionKey
  peerName: (handle: string) => string | undefined
}): React.JSX.Element => <MessagesView mail={useMail(messages, origin)} peerName={peerName} />

// An undocked item's id in its terminal's pane: a plan's tab, an artifact's id, or the
// messages' tab.
export const paneItemOf = (item: CompanionWindow["item"]): string =>
  item.kind === "messages" ? mailTab : item.kind === "plan" ? planTab(item.ref) : item.ref.id

// Part of a terminal's companion undocked into a window of its own: a plan, something its
// agent showed, or its messages, as in its pane, loading from that terminal, `origin`. The
// window's menu docks it back there. Once that terminal closes, what it shows stays as
// it was: nothing new loads.
export const UndockedWindow = ({
  companions,
  messages,
  origin,
  window: { item },
  peerName,
}: {
  companions: Companions | undefined
  messages: Messages | undefined
  origin: CompanionKey
  window: CompanionWindow
  peerName: (handle: string) => string | undefined
}): React.JSX.Element => (
  <div className="artifact-window">
    {item.kind === "messages"
      ? messages && <MessagesContent messages={messages} origin={origin} peerName={peerName} />
      : item.kind === "plan"
        ? companions && <PlanContent companions={companions} origin={origin} plan={item.ref} />
        : companions && (
            <ArtifactContent companions={companions} origin={origin} artifact={item.ref} />
          )}
  </div>
)
