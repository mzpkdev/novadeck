import { describe, expect, it } from "vitest"
import { page } from "vitest/browser"

import { expectStaysAbsent, openWorkspace } from "./support/workspace"

const restart = () => page.getByRole("button", { name: /^Restart to update/ })

describe("the footer's update", () => {
  it("is absent where the host does not update", async () => {
    await openWorkspace()
    await expectStaysAbsent(restart())
    expect(restart().query()).toBeNull()
  })

  it("offers a restart that names the version once the host has an update", async () => {
    await openWorkspace("/?demo=update")
    await expect.element(page.getByRole("status").filter({ hasText: "Update ready" })).toBeVisible()
    await expect
      .element(page.getByRole("button", { name: "Restart to update to 0.0.80" }))
      .toBeVisible()
  })
})
