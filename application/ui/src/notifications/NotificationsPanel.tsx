import {
  CheckCheck,
  Check,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleX,
  ClipboardList,
  type LucideIcon,
} from "lucide-react"

import { SidebarItem, sidebarListClasses } from "../sidebar/SidebarItem"
import { sidebarCreateClasses } from "../sidebar/SidebarPanel"
import type { Viewing } from "../terminals/unread-state"
import { Tooltip } from "../ui-toolkit/Tooltip"
import { dismissable, type Notification, type NotificationKind } from "./notifications"

// Each kind in a glyph of its own, calm beside the tab's: a question, a permission to
// give, a plan to read, a failure and a finish. sidebar.css tints them as tabs are.
const icons: Readonly<Record<NotificationKind, LucideIcon>> = {
  question: CircleHelp,
  permission: CircleAlert,
  plan: ClipboardList,
  failed: CircleX,
  done: CircleCheck,
}

type NotificationsPanelProps = {
  items: readonly Notification[]
  // The terminal the person is looking at, which is no news to them.
  viewing: Viewing
  onReveal: (terminalId: string, context: string) => void
  onDismiss: (context: string, terminalId: string) => void
  onDismissAll: () => void
}

// Everything across the workspace that asks for the person, as rows of the sidebar.
export const NotificationsPanel = ({
  items,
  viewing,
  onReveal,
  onDismiss,
  onDismissAll,
}: NotificationsPanelProps): React.JSX.Element => (
  <div className="notifications-panel flex min-h-0 min-w-0 w-full flex-1 flex-col">
    {items.some(({ kind }) => dismissable(kind)) && (
      <button className={sidebarCreateClasses} type="button" onClick={onDismissAll}>
        <CheckCheck size={14} className="shrink-0" />
        <span className="min-w-0 truncate">Mark all read</span>
      </button>
    )}
    {items.length === 0 ? (
      <p className="notifications-empty px-3 py-3 text-control">Nothing needs you.</p>
    ) : (
      <div
        className={`notifications-list ${sidebarListClasses}`}
        role="list"
        aria-label="Notifications"
      >
        {items.map((item) => {
          const Icon = icons[item.kind]
          const where = `${item.projectName} · ${item.sessionName}`
          return (
            <SidebarItem
              key={`${item.context}/${item.terminalId}`}
              className="notification"
              role="listitem"
              data-notification={item.kind}
              data-notification-terminal={item.terminalId}
              name={item.terminalName}
              icon={<Icon size={14} strokeWidth={1.5} />}
              selected={viewing?.context === item.context && viewing.id === item.terminalId}
              selectLabel={`Go to ${item.terminalName}`}
              description={`${item.status}. ${where}`}
              tooltip={`${item.terminalName}\n${item.status}\n${where}`}
              onSelect={() => onReveal(item.terminalId, item.context)}
              detail={
                <>
                  <span className="shrink-0">{item.status}</span>
                  <span className="notification-where min-w-0 truncate">{where}</span>
                </>
              }
              {...(item.reply
                ? {
                    below: (
                      <span className="notification-reply truncate text-caption leading-[18px]">
                        {item.reply}
                      </span>
                    ),
                  }
                : {})}
              {...(dismissable(item.kind)
                ? {
                    actions: (
                      <Tooltip content="Mark read">
                        <button
                          className="notification-dismiss icon-button small dim quiet"
                          type="button"
                          aria-label={`Mark ${item.terminalName} read`}
                          onClick={() => onDismiss(item.context, item.terminalId)}
                        >
                          <Check size={13} strokeWidth={1.5} />
                        </button>
                      </Tooltip>
                    ),
                  }
                : {})}
            />
          )
        })}
      </div>
    )}
  </div>
)
