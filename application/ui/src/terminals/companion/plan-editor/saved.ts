import type { EditorState } from "@codemirror/state"

import { createKept } from "../kept"
import type { PlanScroll } from "./scroll"

// What a plan's editor held when it closed, so the next one for that plan, as a view
// switch or a tab Focus no longer keeps builds it again, opens as it was left: the parsed
// file, its undo history and selection, and where it was scrolled.
export type SavedEditor = {
  readonly state: EditorState
  // Where the pane was scrolled, once it was.
  readonly scroll: PlanScroll | null
}

// By plan, the latest few, which every plan editor shares.
export const savedEditors = createKept<SavedEditor>(12)
