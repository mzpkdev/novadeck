import type { WorkspaceTarget } from "./types"

// What agents put in front of the user beside their terminals: the plans they write,
// and images, project files and preview-browser pages they show. A backend reports
// them; each terminal's companion pane presents them. The content-preview demo
// implements this with sample agents; a runner reports the same from the agents' own
// files and hooks, and from what they present through NovaDeck's MCP server.

// A terminal, as the backend port knows it: terminal IDs repeat across sessions.
export type CompanionKey = WorkspaceTarget & { readonly terminalId: string }

export const companionKeyId = ({
  projectId,
  workspaceSessionId,
  terminalId,
}: CompanionKey): string => `${projectId}/${workspaceSessionId}/${terminalId}`

// The terminal a `companionKeyId` names. Its ids hold no slashes.
export const companionKeyOf = (id: string): CompanionKey => {
  const [projectId = "", workspaceSessionId = "", terminalId = ""] = id.split("/")
  return { projectId, workspaceSessionId, terminalId }
}

// A plan file as it stands. `revision` names this exact text; saving an edit says which
// revision it was made on.
export type PlanSnapshot = {
  // The backend's reference for the plan, stable while the agent keeps it.
  readonly ref: string
  // The root agent's plan, or a subagent's.
  readonly role: "root" | "subagent"
  readonly path: string
  readonly agent: string
  // Whether NovaDeck's skill is installed for this agent. It tells the agent to re-read
  // the plan before acting on it, apply the notes left in it, and remove each one.
  readonly skill: boolean
  // Whether `save` can write it. A plan that lives only in the agent's messages, or a
  // backend that can't write plans yet, leaves it read-only.
  readonly writable: boolean
  readonly text: string
  readonly revision: string
  // The backend sent only the start of a very long plan.
  readonly truncated?: boolean
}

export type ArtifactKind = "image" | "file" | "page"

// Something the agent showed, as the pane lists it. Its content loads on demand.
export type ArtifactRef = {
  readonly id: string
  readonly kind: ArtifactKind
  readonly name: string
  readonly detail: string
  // Changes when the agent shows it again with new content.
  readonly version: number
  // A file that may hold secrets: shown only when the user picks it, never by itself.
  readonly held?: boolean
}

export type ArtifactContent =
  // An image, by a URL the page can load.
  | { readonly kind: "image"; readonly src: string }
  // A text file, with the lines the agent pointed at. `firstLine` numbers
  // the first of `lines`.
  | {
      readonly kind: "file"
      readonly path: string
      readonly firstLine: number
      readonly lines: readonly string[]
      readonly from: number
      readonly to: number
    }
  // A web page, by its http(s) address. `live` when the backend's host can load it in the
  // pane, as the desktop app does; otherwise it shows as a link to open in the browser,
  // with its `snapshot` image when the backend has one.
  | {
      readonly kind: "page"
      readonly url: string
      readonly live: boolean
      readonly snapshot?: string
    }

// What an agent showed or the person attached, as the backend keeps it: a pointer to a
// file or page, never a copy, held by exactly one terminal's bar or one undocked window.
// Its content loads when something shows it, so it shows what the file holds now.

// An item's id, as its backend names it: stable across restarts and unique in the app.
export type ItemId = string & { readonly __item: unique symbol }

export const itemIdOf = (id: string): ItemId => id as ItemId

// Who holds the item: a terminal's bar, or a window of its own.
export type ItemHolder = { readonly terminalId: string } | { readonly windowId: string }

export type ItemKind = ArtifactKind | "plan"

export type CompanionItem = {
  readonly id: ItemId
  readonly holder: ItemHolder
  readonly kind: ItemKind
  readonly name: string
  readonly detail: string
  // A file's or plan's path, or the page's address.
  readonly path: string | null
  readonly url: string | null
  // The lines it points at, numbered from 1.
  readonly lines: { readonly from: number; readonly to: number } | null
  // A file that may hold secrets: shown only when the person picks it.
  readonly held: boolean
  // Shown by an agent, or attached by the person.
  readonly by: "agent" | "person"
  // The terminal it was shown from, which a window docks back into.
  readonly from: { readonly terminalId: string; readonly handle: string }
  // Counts its shows; a higher version is something shown again.
  readonly version: number
  // The person asked to see it: it opens rather than waits.
  readonly asked: boolean
  readonly shownAt: number
  // A plan's agent, by the name the person knows it by, and whose plan it is.
  readonly plan: { readonly agent: string; readonly role: "root" | "subagent" } | null
}

export const isOnBar = (
  item: CompanionItem,
  terminalId: string,
): item is CompanionItem & { readonly holder: { readonly terminalId: string } } =>
  "terminalId" in item.holder && item.holder.terminalId === terminalId

export const windowOfItem = (item: CompanionItem): string | undefined =>
  "windowId" in item.holder ? item.holder.windowId : undefined

type Pointer = Pick<CompanionItem, "kind" | "path" | "url">

// What a file or page item points at, so showing the same thing again finds it. A plan
// has none here: which agent's plan slot it fills is the backend's to know.
const pointerOf = (item: Pointer): string | null =>
  item.kind === "plan" ? null : item.kind === "page" ? `page:${item.url}` : `file:${item.path}`

export const samePointer = (a: Pointer, b: Pointer): boolean => {
  const pointer = pointerOf(a)
  return pointer !== null && pointer === pointerOf(b)
}

// The item on terminal `terminalId`'s own bar that points where `pointer` does, which an
// agent showing it again updates rather than adding another.
export const ownItemWith = (
  items: readonly CompanionItem[],
  terminalId: string,
  pointer: Pointer,
): CompanionItem | undefined =>
  items.find((item) => isOnBar(item, terminalId) && samePointer(item, pointer))

// A terminal's companion, as it stands.
export type CompanionSnapshot = {
  readonly key: CompanionKey
  readonly plans: readonly PlanSnapshot[]
  // What the agent has shown, oldest first.
  readonly shown: readonly ArtifactRef[]
}

export type CompanionEvent =
  // A plan appeared, or its file changed: the agent wrote it, or it changed on disk.
  | { readonly type: "plan/changed"; readonly key: CompanionKey; readonly plan: PlanSnapshot }
  // The agent no longer keeps the plan.
  | { readonly type: "plan/removed"; readonly key: CompanionKey; readonly ref: string }
  // The agent showed something, or showed it again. `asked`: the user asked for it, so
  // it opens; an agent says so when it presents something it was asked for. `seen`: it
  // was shown before this session, as after a reload, so it's listed as already seen.
  | {
      readonly type: "artifact/shown"
      readonly key: CompanionKey
      readonly artifact: ArtifactRef
      readonly asked: boolean
      readonly seen?: boolean
    }
  // The terminal's agent is gone, and with it what it showed.
  | { readonly type: "companion/closed"; readonly key: CompanionKey }

// Saving an edit: the plan's new revision, or, when the file changed since the revision
// the edit was made on, the file as it now stands, to merge the edit into.
export type PlanSaved =
  | { readonly saved: true; readonly revision: string }
  | { readonly saved: false; readonly current: PlanSnapshot }

export type Companions = {
  // Every terminal's companion as it stands now; events follow.
  readonly snapshot: () => readonly CompanionSnapshot[]
  readonly subscribe: (listener: (event: CompanionEvent) => void) => () => void
  readonly load: (key: CompanionKey, artifactId: string) => Promise<ArtifactContent>
  // Writes the user's edit to the plan file, unless it changed since `basedOn`.
  readonly save: (
    key: CompanionKey,
    ref: string,
    text: string,
    basedOn: string,
  ) => Promise<PlanSaved>
}

// Companions with nothing to show, for a backend whose terminals have only their messages
// in the pane. Each call gives a new one: the pane keeps its state per companions.
export const emptyCompanions = (): Companions => ({
  snapshot: () => [],
  subscribe: () => () => {},
  load: () => Promise.reject(new Error("Nothing was shown")),
  save: () => Promise.reject(new Error("There are no plans")),
})

// A note as NovaDeck writes it into the plan: an HTML comment, invisible once rendered,
// marked for the agent's skill to find.
export const noteOpen = "<!-- novadeck: "
export const noteClose = " -->"

export const notePattern = /<!-- novadeck: (.*?) -->/g

export const notesIn = (text: string): number => [...text.matchAll(notePattern)].length

// A note's text as the comment around it allows: one line, and no `-->`, which would
// end the comment early and spill the rest of the note into the plan.
export const noteSafe = (text: string): string => {
  let safe = text.replace(/\s*\n\s*/g, " ")
  while (safe.includes("-->")) safe = safe.replaceAll("-->", "->")
  return safe
}
