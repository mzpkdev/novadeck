import { AppWindow } from "lucide-react"
import { lazy, Suspense, useRef, type ReactNode } from "react"

import { notePattern, notesIn } from "../../model/companion"
import type { Messages } from "../../model/messages"
import { ArtifactViewer } from "./ArtifactViewer"
import type { Guest } from "./guests"
import { useMail, type MailHandle } from "./mail"
import { MessagesView } from "./MessagesView"
import { mailTab, planRefOf, type Shown } from "./pane"
import type { PlanEditorHandle } from "./plan-editor/PlanEditor"
import { headingsOf } from "./plan-text"
import {
  closePane,
  currentMarks,
  shownTab,
  toggleChanges,
  useArtifactContent,
  type CompanionHandle,
  type PlanDoc,
  type PlanPresentation,
} from "./state"

// The editor loads when a plan first opens, so the workspace never pays for it.
const PlanEditor = lazy(() =>
  import("./plan-editor/PlanEditor").then((module) => ({ default: module.PlanEditor })),
)

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`

// The headings in the file, with what the latest revision changed and where notes are.
const PlanOutline = ({
  plan,
  jump,
}: {
  plan: PlanDoc
  jump: (at: number) => void
}): React.JSX.Element | null => {
  const headings = headingsOf(plan.text)
  if (!headings.length) return null
  const marks = plan.showChanges ? currentMarks(plan) : []
  const notes = [...plan.text.matchAll(notePattern)].map((match) => match.index)
  // Each heading's section runs to the next heading.
  const sections = headings.map((heading, index) => ({
    ...heading,
    end: headings[index + 1]?.at ?? plan.text.length,
  }))
  return (
    <nav className="plan-spine" aria-label="Plan outline">
      <p className="plan-spine-label">Contents</p>
      <ul className="plan-spine-context">
        {sections.map((section) => {
          const count = notes.filter((at) => at >= section.at && at < section.end).length
          const changed = marks.some((mark) => mark.from < section.end && mark.to > section.at)
          return (
            <li key={section.at}>
              <button onClick={() => jump(section.at)} data-changed={changed}>
                <span>{section.text}</span>
                {count > 0 && <em aria-label={plural(count, "note")}>{count}</em>}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// Undocks what the pane shows into a window of its own, at the end of its header.
const UndockButton = ({ onUndock }: { onUndock: () => void }): React.JSX.Element => (
  <span className="artifact-actions">
    <button
      type="button"
      aria-label="Undock to its own window"
      title="Undock to its own window"
      onClick={onUndock}
    >
      <AppWindow size={13} strokeWidth={1.75} aria-hidden />
    </button>
  </span>
)

const ArtifactTab = ({
  companion,
  artifact,
  openWindow,
}: {
  companion: CompanionHandle
  artifact: Shown
  openWindow: ((artifact: Shown) => void) | undefined
}): React.JSX.Element => (
  <ArtifactViewer
    artifact={artifact}
    load={useArtifactContent(companion, artifact)}
    actions={openWindow && <UndockButton onUndock={() => openWindow(artifact)} />}
  />
)

// One plan, edited where it's read, with its outline: in the pane, or in a window of its
// own once undocked.
export const PlanTab = ({
  companion,
  plan,
  actions,
}: {
  companion: CompanionHandle
  plan: PlanDoc
  // What the place showing the plan offers, at the end of its header.
  actions?: ReactNode
}): React.JSX.Element => {
  const editor = useRef<PlanEditorHandle | null>(null)
  const marks = currentMarks(plan)
  return (
    <div className="plan-reader-body" data-outline={headingsOf(plan.text).length > 0}>
      <PlanOutline plan={plan} jump={(at) => editor.current?.jumpTo(at)} />
      <div className="plan-document-scroll" data-changes={plan.showChanges}>
        <div className="plan-meta">
          <code className="plan-meta-path">{plan.path}</code>
          <span>v{plan.writes + 1}</span>
          {marks.length > 0 && (
            <button
              className="plan-changes-toggle"
              aria-pressed={plan.showChanges}
              onClick={() => companion.update((pane) => toggleChanges(pane, plan.ref))}
            >
              <i aria-hidden="true" />
              {plural(plan.changes, "change")} since you last read
              <span>{plan.showChanges ? "Hide" : "Show"}</span>
            </button>
          )}
          {plan.unsaved && <span className="plan-meta-hint">Not saved yet. Trying again.</span>}
          {plan.resolved > 0 && plan.marked === plan.text && (
            <span>
              {plan.agent} resolved {plural(plan.resolved, "note")}
            </span>
          )}
          {!plan.writable && (
            <span className="plan-meta-hint">Read-only: NovaDeck can't write this plan yet.</span>
          )}
          {plan.truncated && (
            <span className="plan-meta-hint">It's long, so only its start is shown.</span>
          )}
          {/* Without NovaDeck's skill, notes wait for the user to point the agent at them. */}
          {plan.writable && !plan.skill && notesIn(plan.text) > 0 && (
            <span className="plan-meta-hint">
              {plan.agent} doesn't have NovaDeck's skill. Ask it to re-read the plan.
            </span>
          )}
          {actions && <span className="plan-meta-actions">{actions}</span>}
        </div>
        <Suspense fallback={null}>
          <PlanEditor
            readOnly={!plan.writable}
            text={plan.text}
            marks={marks}
            onChange={(text, moved) => companion.edit(plan.ref, text, moved)}
            onReady={(handle) => {
              editor.current = handle
            }}
            onClose={() => companion.closeEditor(plan.ref)}
          />
        </Suspense>
      </div>
    </div>
  )
}

const noGuests: readonly Guest[] = []

// Another terminal's item placed on this bar, as its own terminal's pane shows it, loading
// and saving through that terminal, with a line saying whose it is.
const GuestTab = ({
  guest,
  messages,
  peerName,
}: {
  guest: Guest
  messages: Messages | undefined
  peerName: (handle: string) => string | undefined
}): React.JSX.Element => (
  <div className="guest-tab">
    <p className="guest-from">From {guest.origin.name}</p>
    {guest.kind === "plan" ? (
      <PlanTab
        key={`${guest.plan.ref}:${guest.plan.writable}`}
        companion={guest.companion}
        plan={guest.plan}
      />
    ) : guest.kind === "artifact" ? (
      <ArtifactTab companion={guest.companion} artifact={guest.artifact} openWindow={undefined} />
    ) : (
      messages && <GuestMessages messages={messages} guest={guest} peerName={peerName} />
    )}
  </div>
)

const GuestMessages = ({
  messages,
  guest,
  peerName,
}: {
  messages: Messages
  guest: Guest
  peerName: (handle: string) => string | undefined
}): React.JSX.Element => <MessagesView mail={useMail(messages, guest.from)} peerName={peerName} />

// A terminal's companion pane, wherever it is presented: one of its plans, edited where
// it's read, one of the other things its agent showed the user, or its messages.
export const CompanionPane = ({
  companion,
  mail,
  peerName,
  presentation,
  openWindow,
  undockPlan,
  guests = noGuests,
  messages: messageStore,
}: {
  companion: CompanionHandle
  mail: MailHandle
  peerName: (handle: string) => string | undefined
  presentation: PlanPresentation
  // Undocks what's shown into a window of its own; absent where there's no such window.
  openWindow?: ((artifact: Shown) => void) | undefined
  undockPlan?: ((plan: PlanDoc) => void) | undefined
  // Other terminals' items placed on this terminal's bar, and the messages they read.
  guests?: readonly Guest[] | undefined
  messages?: Messages | undefined
}): React.JSX.Element => {
  const { pane } = companion
  const tab = shownTab(
    pane,
    mail.present,
    guests.map((guest) => guest.id),
  )
  const guest = guests.find((each) => each.id === tab)
  const messages = tab === mailTab
  const ref = planRefOf(tab)
  const plan = pane.plans.find((candidate) => candidate.ref === ref)
  const artifact = pane.artifacts.find((shown) => shown.id === tab)
  const agent = pane.plans[0]?.agent ?? "The agent"
  return (
    <section
      className="plan-reader"
      data-workspace-companion
      data-presentation={presentation}
      aria-label={messages ? "Messages" : `What ${agent} showed you`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation()
          companion.update(closePane)
        }
      }}
      // Leaving the plan saves it at once, so an agent told to re-read it finds the edits.
      onBlur={(event) => {
        if (plan && !event.currentTarget.contains(event.relatedTarget)) companion.flush(plan.ref)
      }}
    >
      {guest ? (
        <GuestTab key={guest.id} guest={guest} messages={messageStore} peerName={peerName} />
      ) : messages ? (
        <MessagesView mail={mail} peerName={peerName} />
      ) : plan ? (
        <PlanTab
          key={`${plan.ref}:${plan.writable}`}
          companion={companion}
          plan={plan}
          actions={undockPlan && <UndockButton onUndock={() => undockPlan(plan)} />}
        />
      ) : artifact ? (
        <ArtifactTab
          key={`${artifact.id}@${artifact.version}`}
          companion={companion}
          artifact={artifact}
          openWindow={openWindow}
        />
      ) : (
        // All that's left may hold secrets, which shows only once picked.
        <div className="artifact-status">Pick what to show from the taskbar.</div>
      )}
    </section>
  )
}
