import { RunnerError } from "@novadeck/protocol/client"

import { describe, expect, it } from "../../test"
import { describeFailure } from "./index"

describe("connection failure", () => {
  it("says in words what failed, with its code", () => {
    expect(describeFailure(new RunnerError("UNAUTHORIZED"))).toBe(
      "The runner did not accept this app's credentials. (UNAUTHORIZED)",
    )
    expect(describeFailure(new RunnerError("INTERNAL_SERVER_ERROR"))).toBe(
      "The runner reported a problem. (INTERNAL_SERVER_ERROR)",
    )
  })

  it("keeps the reason a transport gives for being unavailable", () => {
    expect(describeFailure(new RunnerError("CLOSED", "No desktop host provides a runner."))).toBe(
      "No desktop host provides a runner. (CLOSED)",
    )
  })
})
