import { describe, expect, it } from "vitest"

import { createMockTerminal, mockReply } from "./samples"

const shell = createMockTerminal(
  { projectId: "storefront", workspaceSessionId: "initial" },
  7,
  "~/projects/storefront",
)

describe("the demo shell", () => {
  it("answers help with what works and that it is simulated", () => {
    const reply = mockReply("help", shell)

    expect(reply).toContain("Local demo commands")
    expect(reply).toContain("simulated")
  })

  it("answers ls and git status like a shell would", () => {
    expect(mockReply("ls -la", shell)).toContain("package.json")
    expect(mockReply("git status", shell)).toContain("working tree clean")
  })

  it("sends claude and codex to the terminals that run an agent", () => {
    expect(mockReply("claude", shell)).toContain("Checkout implementation")
  })

  it("does not dead-end on a command it does not know", () => {
    const reply = mockReply("fnord --now", shell)

    expect(reply).toContain("command not found: fnord")
    expect(reply).toContain("simulated shell")
    expect(reply).toContain("help")
  })
})
