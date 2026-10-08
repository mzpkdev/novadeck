import { join } from "node:path"

import type { Request } from "../harnesses/activity.js"
import { describe, expect, it } from "../test.js"
import { waitingOf } from "./peers.js"

const request = (fields: Partial<Request>): Request => ({
  requestId: "r-1",
  actor: null,
  toolName: "Bash",
  kind: "permission",
  subject: null,
  choices: [],
  askedAt: 0,
  ...fields,
})

const subject = (fields: Partial<Request>) => waitingOf({ pending: [request(fields)] })?.subject

describe("what peers learn of a request waiting on the person", () => {
  it("is the oldest, with how many wait after it", () => {
    expect(waitingOf({ pending: [] })).toBeNull()
    expect(waitingOf(null)).toBeNull()
    expect(
      waitingOf({
        pending: [request({ subject: "src/a.ts", toolName: "Edit" }), request({}), request({})],
      }),
    ).toEqual({ kind: "permission", tool: "Edit", subject: "src/a.ts", more: 2 })
  })

  it("never shows a permission's command or address, which may hold a token", () => {
    expect(subject({ subject: "curl -H 'Authorization: Bearer abc' x" })).toBeNull()
    expect(subject({ subject: "https://example.com/?token=abc", toolName: "WebFetch" })).toBeNull()
    expect(subject({ subject: "rm -rf build" })).toBeNull()
    // A plain path shows, in either separator, unless it is a file that may hold secrets.
    // (A drive letter's colon makes Windows' absolute paths count as addresses.)
    expect(subject({ subject: "src/a.ts", toolName: "Write" })).toBe("src/a.ts")
    expect(subject({ subject: join("work", "src", "a.ts"), toolName: "Write" })).toBe(
      join("work", "src", "a.ts"),
    )
    expect(subject({ subject: "work/.env", toolName: "Write" })).toBeNull()
    expect(subject({ subject: "home/me/.ssh/config", toolName: "Edit" })).toBeNull()
    expect(subject({ subject: join("home", "me", ".ssh", "config"), toolName: "Edit" })).toBeNull()
  })

  it("shows a question's or a plan's subject as it is", () => {
    expect(subject({ kind: "question", subject: "Which database?" })).toBe("Which database?")
    expect(subject({ kind: "plan", subject: "plan.md" })).toBe("plan.md")
  })
})
