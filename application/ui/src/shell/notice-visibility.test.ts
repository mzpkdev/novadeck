import { createElement } from "react"

import { describe, expect, it } from "../test"
import { render } from "../test/render"
import { useNoticeShown, useReportNotice } from "./notice-visibility"

const Notice = ({ visible }: { readonly visible: boolean }): null => {
  useReportNotice(visible)
  return null
}

const Reader = ({ onRead }: { readonly onRead: (shown: boolean) => void }): null => {
  onRead(useNoticeShown())
  return null
}

describe("the footer notices' visibility", () => {
  it("is read while any notice is visible, and not once the last is gone", () => {
    let read = false
    const both = (a: boolean, b: boolean) =>
      createElement(
        "div",
        null,
        createElement(Notice, { visible: a }),
        createElement(Notice, { visible: b }),
        createElement(Reader, { onRead: (shown) => (read = shown) }),
      )
    const { rerender, unmount } = render(both(false, false))
    expect(read).toBe(false)
    rerender(both(true, false))
    expect(read).toBe(true)
    rerender(both(true, true))
    rerender(both(false, true))
    expect(read).toBe(true)
    rerender(both(false, false))
    expect(read).toBe(false)
    unmount()
  })
})
