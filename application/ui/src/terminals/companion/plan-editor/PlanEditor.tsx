import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { Language, LanguageSupport, defineLanguageFacet } from "@codemirror/language"
import { Annotation, EditorState, Transaction } from "@codemirror/state"
import { EditorView, keymap } from "@codemirror/view"
import { GFM, parser } from "@lezer/markdown"
import { useEffect, useLayoutEffect, useRef } from "react"

import type { Mark } from "../plan-doc"
import { editorTheme } from "./editor-theme"
import { currentAgentMarks, livePreview, setMarks } from "./live-preview"
import { savedEditors } from "./saved"
import { followScroll, restoreScroll, scrollLineToTop, type PlanScroll } from "./scroll"
import { lineChanges } from "./sync"

// Markdown with GitHub's tables and task lists, and nothing embedded: plans don't need
// HTML, CSS or JavaScript highlighting, which would triple the editor's size.
const planMarkdown = new LanguageSupport(
  new Language(defineLanguageFacet(), parser.configure(GFM), [], "markdown"),
)

// Marks the agent's rewrites, which are not the user's edits.
const fromAgent = Annotation.define<boolean>()

// What the reader can ask of the editor.
export type PlanEditorHandle = { readonly jumpTo: (at: number) => void }

type Listeners = {
  readonly onChange: (text: string, marks: readonly Mark[]) => void
}

// Each editor's latest listeners. A saved state outlives the editor that made it, so its
// extensions reach the listeners through the editor showing it now.
const listenersOf = new WeakMap<EditorView, { readonly current: Listeners }>()

// The editor's behaviour, fixed for a state's life: the pane remounts the editor, and
// starts a new state, if the plan becomes writable or stops being so.
const extensions = (readOnly: boolean) => [
  history(),
  keymap.of([...defaultKeymap, ...historyKeymap]),
  planMarkdown,
  EditorView.lineWrapping,
  EditorState.readOnly.of(readOnly),
  // Read-only holds for every change, not only typing: note keys, checkboxes and the
  // table's own edits dispatch directly. Only the file's own changes land.
  EditorState.transactionFilter.of((transaction) =>
    transaction.docChanged && transaction.startState.readOnly && !transaction.annotation(fromAgent)
      ? []
      : transaction,
  ),
  EditorView.contentAttributes.of({ "aria-label": "Plan" }),
  livePreview,
  editorTheme,
  EditorView.updateListener.of((update) => {
    if (
      update.transactions.some(
        (transaction) => transaction.docChanged && !transaction.annotation(fromAgent),
      )
    )
      listenersOf
        .get(update.view)
        ?.current.onChange(update.state.doc.toString(), currentAgentMarks(update.state))
  }),
]

// The plan file, edited where it's rendered. `text` is the file; the user's edits go out
// through `onChange`, and the agent's rewrites come in as changes to it. `id` names the
// plan, whose editor opens again as the last one for it was left.
export const PlanEditor = ({
  id,
  text,
  marks,
  onChange,
  onReady,
  onClose,
  readOnly = false,
}: {
  id: string
  text: string
  marks: readonly Mark[]
  // The text, and the latest revision's highlights moved along with the edit.
  onChange: (text: string, marks: readonly Mark[]) => void
  onReady: (handle: PlanEditorHandle) => void
  onClose: () => void
  // The plan can't be written: it reads, and takes no edits or notes.
  readOnly?: boolean
}): React.JSX.Element => {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // The latest props, for the editor's listeners, which outlive a render.
  const latest = useRef({ id, text, marks, onChange, onReady, onClose, readOnly })
  useLayoutEffect(() => {
    latest.current = { id, text, marks, onChange, onReady, onClose, readOnly }
  })
  useEffect(() => {
    const { id: plan, text: doc, readOnly: locked } = latest.current
    const saved = savedEditors.get(plan)
    const reopened = saved?.state.readOnly === locked ? saved : undefined
    const editor = new EditorView({
      parent: host.current!,
      state: reopened?.state ?? EditorState.create({ doc, extensions: extensions(locked) }),
    })
    listenersOf.set(editor, latest)
    editor.dispatch({ effects: setMarks.of(latest.current.marks) })
    let scroll: PlanScroll | null = reopened?.scroll ?? null
    if (scroll) restoreScroll(editor, scroll)
    const stopScroll = followScroll(editor, (at) => {
      scroll = at
    })
    view.current = editor
    latest.current.onReady({
      jumpTo: (at) => scrollLineToTop(editor, at),
    })
    return () => {
      // Closing the pane leaves no empty note behind: none of the editor's updates follow.
      latest.current.onClose()
      stopScroll()
      savedEditors.keep(plan, { state: editor.state, scroll })
      editor.destroy()
    }
  }, [])
  // The file changed outside the editor: apply the difference, keeping the cursor. It
  // isn't the user's to undo: undoing it would only write the old plan back.
  useEffect(() => {
    const editor = view.current
    if (!editor) return
    const doc = editor.state.doc.toString()
    if (doc === text) return
    editor.dispatch({
      changes: lineChanges(doc, text),
      effects: setMarks.of(marks),
      annotations: [fromAgent.of(true), Transaction.addToHistory.of(false)],
    })
  }, [text, marks])
  return (
    <div
      ref={host}
      className="plan-editor nodrag nopan nowheel"
      data-readonly={readOnly || undefined}
    />
  )
}
