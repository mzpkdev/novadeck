import { EditorSelection } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"

import { findTables } from "./tables"

// Notes as NovaDeck writes them into the plan, and the control that adds one.

export const noteOpen = "<!-- novadeck: "
export const noteClose = " -->"

// Lucide's message-square-plus, as the plan's other note controls use. Widgets are plain
// DOM, so it's drawn here rather than through lucide-react.
const noteIconPaths = [
  "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
  "M12 8v6",
  "M9 11h6",
]

// With `plus`, the control that adds a note; without it, the mark on a note.
export const noteIcon = (plus = true): SVGSVGElement => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  for (const [name, value] of Object.entries({
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.75",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  }))
    svg.setAttribute(name, value)
  for (const d of plus ? noteIconPaths : noteIconPaths.slice(0, 1)) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
    path.setAttribute("d", d)
    svg.append(path)
  }
  return svg
}

// Puts an empty note under the given line, indented to stay inside a list item, with the
// cursor ready in it.
export const addNote = (view: EditorView, at: number): void => {
  // A note beside a table goes after it: a line inside would split the table.
  const table = findTables(view.state.doc.toString()).find(
    (found) => at >= found.from && at <= found.to,
  )
  const current = view.state.doc.lineAt(table ? table.to : at)
  const indent = /^(\s*(?:\d+[.)]|[-*+])\s+|\s+)/.exec(current.text)?.[1]?.replace(/\S/g, " ") ?? ""
  const insert = `\n${indent}${noteOpen}${noteClose}`
  const cursor = current.to + 1 + indent.length + noteOpen.length
  view.dispatch({
    changes: { from: current.to, insert },
    selection: EditorSelection.cursor(cursor),
  })
  view.focus()
}

// The quiet mark a note starts with: its bubble, without the plus.
export const noteLabel = (): HTMLElement => {
  const label = document.createElement("span")
  label.className = "cm-plan-note-label"
  label.setAttribute("role", "img")
  label.setAttribute("aria-label", "Note")
  label.append(noteIcon(false))
  return label
}
