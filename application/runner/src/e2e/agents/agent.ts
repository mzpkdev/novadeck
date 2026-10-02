import type { AgentName } from "@novadeck/protocol"

import type { Dialect } from "../model/dialect.js"
import type { FakeModel } from "../model/server.js"
import type { Sandbox } from "../sandbox.js"

/**
 * One harness, as an end-to-end test runs it: its pinned program, pointed at the fake
 * model, in a sandbox of its own, starting straight at its prompt with NovaDeck's plugin
 * connected.
 */
export type AgentSetup = {
  readonly agent: AgentName
  readonly dialect: Dialect
  /**
   * Seeds the harness's configuration inside the sandbox, so it starts at its own prompt
   * with no trust, onboarding, sign-in, update or key screen. Returns what the sandbox's
   * environment gains for it: its config home, the fake model's address and the fake
   * credential. The test's deck then connects NovaDeck's plugin through the harness's own
   * commands, with that environment, as the Connect button does.
   */
  readonly prepare: (
    sandbox: Sandbox,
    model: FakeModel,
  ) => Promise<Readonly<Record<string, string>>>
  /**
   * Finishes what only the connected plugin makes possible, before any harness starts:
   * Codex trusts NovaDeck's hooks, whose hashes are of the hooks the plugin installed.
   */
  readonly connected?: (sandbox: Sandbox, model: FakeModel) => Promise<void>
  /**
   * The hosts of the harness's real API and login, which no request may even try to
   * reach: one that does fails the test, as the fake model was bypassed.
   */
  readonly hosts?: readonly string[]
}
