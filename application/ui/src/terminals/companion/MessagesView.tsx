import { ArrowDownLeft, ArrowUpRight } from "lucide-react"
import { useId } from "react"

import type { AgentMessage, MessageThread } from "../../model/messages"
import { Switch } from "../../ui-toolkit/Switch"
import type { MailHandle } from "./mail"

const clock = (at: number): string =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

// Where a message is on its way, in a word or two.
const stateText = (message: AgentMessage): string => {
  switch (message.state) {
    case "queued":
      return "Waiting"
    case "leased":
      return "Delivering"
    case "delivered":
      return message.deliveredAt === null ? "Delivered" : `Delivered ${clock(message.deliveredAt)}`
    case "held":
      return message.held === "release" ? "Held for release" : "Held while paused"
    case "gone":
      return "Not delivered"
  }
}

const stateHint: Partial<Record<AgentMessage["state"], string>> = {
  leased: "Handed to the agent's hook, which hasn't confirmed it yet",
  gone: "Its recipient's session ended before it arrived",
}

const MessageItem = ({
  message,
  handle,
}: {
  message: AgentMessage
  handle: string
}): React.JSX.Element => {
  const sent = message.from === handle
  const Direction = sent ? ArrowUpRight : ArrowDownLeft
  return (
    <li className="mail-message" data-direction={sent ? "sent" : "received"}>
      <div className="mail-message-meta">
        <span className="mail-message-direction">
          <Direction size={12} strokeWidth={1.75} aria-hidden />
          {sent ? `Sent to ${message.to}` : `From ${message.from}`}
        </span>
        <time dateTime={new Date(message.sentAt).toISOString()}>{clock(message.sentAt)}</time>
        <span className="mail-state" data-state={message.state} title={stateHint[message.state]}>
          {stateText(message)}
        </span>
      </div>
      {/* The agent's words, exactly as it wrote them: never formatted or interpreted. */}
      <p className="mail-text">{message.text}</p>
    </li>
  )
}

const ThreadItem = ({
  thread,
  handle,
  peerName,
  onRelease,
}: {
  thread: MessageThread
  handle: string
  peerName: string | undefined
  onRelease: () => void
}): React.JSX.Element => {
  const peer = peerName ?? "A closed terminal"
  const count = thread.messages.length
  return (
    <section className="mail-thread" aria-label={`Thread with ${peer} (${thread.peer})`}>
      <header className="mail-thread-head">
        <b className="mail-thread-peer">{peer}</b>
        <code>{thread.peer}</code>
        <span className="mail-thread-count">
          {count} message{count === 1 ? "" : "s"}
        </span>
        {thread.held && (
          <button
            type="button"
            className="small-button mail-release"
            aria-label={`Release the thread with ${peer}`}
            onClick={onRelease}
          >
            Release
          </button>
        )}
      </header>
      {thread.held && (
        <p className="mail-thread-note">
          Held after {thread.allowed} messages back and forth. Release it to let them go on.
        </p>
      )}
      <ol className="mail-list">
        {thread.messages.map((message) => (
          <MessageItem key={message.id} message={message} handle={handle} />
        ))}
      </ol>
    </section>
  )
}

// A terminal's messages with the other agents in its session: a thread per peer, latest
// first, each message with its direction, time, text and where it is on its way. The
// header holds the pause, which holds every agent's messages.
export const MessagesView = ({
  mail,
  peerName,
}: {
  mail: MailHandle
  peerName: (handle: string) => string | undefined
}): React.JSX.Element => {
  const label = useId()
  const hint = useId()
  const threads = mail.mail?.threads ?? []
  return (
    <div className="mail-view">
      <div className="artifact-meta mail-meta">
        <code>Messages</code>
        {mail.mail && <span>{mail.mail.handle}</span>}
        <span className="artifact-meta-push" />
        <span id={label} className="mail-pause-label">
          Pause messaging
        </span>
        <span id={hint} className="sr-only">
          Holds every agent's messages, in every project, until you resume.
        </span>
        <Switch checked={mail.paused} onChange={mail.pause} labelledBy={label} describedBy={hint} />
      </div>
      {mail.paused && (
        <p className="mail-paused" role="status">
          Messaging is paused. Agents' messages wait, held, until you resume.
        </p>
      )}
      <div className="mail-scroll">
        {threads.length ? (
          threads.map((thread) => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              handle={mail.mail!.handle}
              peerName={peerName(thread.peer)}
              onRelease={() => mail.release(thread.id)}
            />
          ))
        ) : (
          <div className="artifact-status mail-empty">
            No messages yet. Threads with the other agents in this session show here.
          </div>
        )}
      </div>
    </div>
  )
}
