import { act, createElement } from "react"

import type { ChatDialogOption } from "../model/conversation"
import {
  emptyInbox,
  type Inbox,
  type InboxAnswer,
  type InboxItem,
  type InboxState,
} from "../model/inbox"
import { createStore } from "../model/store"
import { describe, expect, it } from "../test"
import { render } from "../test/render"
import { InboxList } from "./InboxList"
import { InboxProvider } from "./InboxProvider"
import { InboxSheet } from "./InboxSheet"

// jsdom has no ResizeObserver, which the sheet's placement watches its anchor with.
Object.assign(globalThis, {
  ResizeObserver: class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
})

const item = (options: readonly ChatDialogOption[]): InboxItem => ({
  id: "i",
  source: {
    projectId: "p",
    workspaceSessionId: "s",
    terminalId: "t",
    handle: "t1",
    agent: "codex",
    title: "Title",
    projectName: "Project",
  },
  at: 0,
  stopped: true,
  seen: false,
  kind: "request",
  request: {
    id: "r",
    kind: "permission",
    tool: "Bash",
    subject: "pnpm add x",
    choices: [],
    subagent: false,
    answered: false,
    dialog: { type: "choices", id: "d", title: null, detail: "pnpm add x", options },
  },
})

const codex: readonly ChatDialogOption[] = [
  { id: "yes", label: "Yes, proceed", text: null },
  {
    id: "always",
    label: "Yes, and don't ask again for commands that start with `pnpm add`",
    text: null,
  },
  { id: "no", label: "No, continue without running it", text: null },
  { id: "differently", label: "No, and tell Codex what to do differently", text: "prompt" },
]

// The sheet of one item, and the answers it gives the Inbox.
const mount = (options: readonly ChatDialogOption[]) => {
  const state = createStore<InboxState>({ ...emptyInbox, items: [item(options)] })
  const sent: InboxAnswer[] = []
  const inbox: Inbox = {
    state,
    answer: (_id, answer) => sent.push(answer),
    see: () => {},
    readAll: () => {},
  }
  const view = render(
    createElement(
      InboxProvider,
      { inbox, reveal: () => {} },
      createElement("div", { id: "inbox-panel" }, createElement(InboxList)),
      createElement(InboxSheet, { active: true }),
    ),
  )
  act(() => view.container.querySelector<HTMLElement>(".inbox-row-select")!.click())
  const press = (name: string): void =>
    act(() =>
      Array.from(document.querySelectorAll<HTMLButtonElement>(".inbox-sheet button"))
        .find((button) => button.textContent?.trim().startsWith(name))!
        .click(),
    )
  const type = (text: string): void =>
    act(() => {
      const field = document.querySelector<HTMLTextAreaElement>(".inbox-sheet textarea")!
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!
      set.call(field, text)
      field.dispatchEvent(new Event("input", { bubbles: true }))
    })
  return { view, sent, press, type }
}

describe("A command permission's answers", () => {
  it("allows with the dialog's plain yes", () => {
    const sheet = mount(codex)
    sheet.press("Allow")

    expect(sheet.sent).toEqual([
      { kind: "request", answer: { type: "choice", dialog: "d", option: "yes" } },
    ])
    sheet.view.unmount()
  })

  it("denies with a note by the option that takes words, sending the note", () => {
    const sheet = mount(codex)
    sheet.press("Deny")
    sheet.type("Use npm.")
    sheet.press("Deny")

    expect(sheet.sent).toEqual([
      {
        kind: "request",
        answer: { type: "choice", dialog: "d", option: "differently", text: "Use npm." },
      },
    ])
    sheet.view.unmount()
  })

  it("denies without a note by the plain no", () => {
    const sheet = mount(codex)
    sheet.press("Deny")
    sheet.press("Deny")

    expect(sheet.sent).toEqual([
      { kind: "request", answer: { type: "choice", dialog: "d", option: "no" } },
    ])
    sheet.view.unmount()
  })

  it("denies at once, with no note to write, where the only no takes none", () => {
    const sheet = mount([
      { id: "a", label: "Allow once", text: null },
      { id: "d", label: "Deny", text: null },
    ])
    sheet.press("Deny")

    expect(sheet.sent).toEqual([
      { kind: "request", answer: { type: "choice", dialog: "d", option: "d" } },
    ])
    sheet.view.unmount()
  })

  it("offers no Deny where no option says no", () => {
    const sheet = mount([{ id: "a", label: "Yes", text: null }])

    expect(document.querySelector(".inbox-sheet")?.textContent).not.toContain("Deny")
    sheet.view.unmount()
  })
})
