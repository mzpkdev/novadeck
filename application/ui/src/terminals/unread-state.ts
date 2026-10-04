// Terminals whose agent finished while the person looked elsewhere, by the session context
// (`${projectId}/${workspaceSessionId}`) that holds them: each stays marked "done, reply
// unread" until the person views it or its agent starts another turn.
export type Unread = Readonly<Record<string, readonly string[]>>

// The terminal the person is looking at: the selected one of the session on screen while
// the page has focus; null while it has none.
export type Viewing = { readonly context: string; readonly id: string } | null

export const noUnread: Unread = {}

export const isUnread = (unread: Unread, context: string, id: string): boolean =>
  unread[context]?.includes(id) ?? false

// Marks a finish, unless the person was looking at that terminal as it finished.
export const markUnread = (
  unread: Unread,
  context: string,
  id: string,
  viewing: Viewing,
): Unread =>
  isUnread(unread, context, id) || (viewing?.context === context && viewing.id === id)
    ? unread
    : { ...unread, [context]: [...(unread[context] ?? []), id] }

export const clearUnread = (unread: Unread, context: string, id: string): Unread => {
  if (!isUnread(unread, context, id)) return unread
  const left = unread[context]!.filter((each) => each !== id)
  const { [context]: _cleared, ...rest } = unread
  return left.length > 0 ? { ...rest, [context]: left } : rest
}

// Clears what the person now looks at.
export const viewUnread = (unread: Unread, viewing: Viewing): Unread =>
  viewing ? clearUnread(unread, viewing.context, viewing.id) : unread

// Keeps only the terminals still there, as `exists` tells by context and id.
export const keepUnread = (
  unread: Unread,
  exists: (context: string, id: string) => boolean,
): Unread => {
  let next = unread
  for (const [context, ids] of Object.entries(unread))
    for (const id of ids) if (!exists(context, id)) next = clearUnread(next, context, id)
  return next
}
