import { act, createElement } from "react"

import { TerminalFrame } from "../terminals/TerminalFrame"
import { describe, expect, it } from "../test"
import { terminalFixture } from "../test/fixtures"
import { render } from "../test/render"
import { ClaudeCard } from "./process-cards/ClaudeCard"
import { CodexCard } from "./process-cards/CodexCard"

const noop = (): void => {}

describe("shared window shell", () => {
  it.each([TerminalFrame, ClaudeCard, CodexCard])(
    "accepts custom content and an icon while retaining the switcher action in %s",
    (Card) => {
      const opened: HTMLButtonElement[] = []
      const onOpen = (button: HTMLButtonElement): void => {
        opened.push(button)
      }
      const page = render(
        createElement(
          Card,
          {
            terminal: terminalFixture(1, "~/project"),
            icon: createElement("svg", { "data-custom-icon": "" }),
            rename: null,
            onBeginRename: noop,
            onRenameDraft: noop,
            onRenameSave: noop,
            onRenameCancel: noop,
            switcher: { onOpen },
          },
          createElement("article", null, "Custom process content"),
        ),
      )
      try {
        expect(page.container.querySelector("article")?.textContent).toBe("Custom process content")
        const button = page.container.querySelector<HTMLButtonElement>(
          'button[aria-label="Switch terminal"]',
        )!
        expect(button.querySelector("[data-custom-icon]")).not.toBeNull()
        act(() => button.click())
        expect(opened).toEqual([button])
      } finally {
        page.unmount()
      }
    },
  )
})
