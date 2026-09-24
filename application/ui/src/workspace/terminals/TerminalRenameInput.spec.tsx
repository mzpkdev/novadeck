import { act, render, screen } from "@testing-library/react"
import { vi } from "vitest"

import { describe, expect, it } from "../../test"
import { TerminalRenameInput } from "./TerminalRenameInput"

describe("TerminalRenameInput", () => {
  it("restores the full initial selection when layout collapses it", () => {
    render(
      <TerminalRenameInput
        id="terminal"
        name="Dev server"
        value="Dev server"
        request={1}
        autoFocus
        className=""
        onChange={vi.fn<(value: string) => void>()}
        onSave={vi.fn<() => void>()}
        onCancel={vi.fn<() => void>()}
      />,
    )

    const field = screen.getByRole("textbox", { name: "Rename Dev server" }) as HTMLInputElement
    field.setSelectionRange(0, 0)
    act(() => document.dispatchEvent(new Event("selectionchange")))
    expect(field).toHaveSelection("Dev server")
  })
})
