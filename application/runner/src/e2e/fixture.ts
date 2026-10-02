import { rmSync } from "node:fs"
import { join } from "node:path"

import { it as base } from "../test.js"
import type { AgentSetup } from "./agents/agent.js"
import { createDeck, type Deck } from "./deck.js"
import { installHarness } from "./install.js"
import { startFakeModel, type FakeModel } from "./model/server.js"
import { createSandbox, tripwire, type Sandbox } from "./sandbox.js"

export { describe, expect } from "../test.js"

export type E2E = {
  readonly model: FakeModel
  readonly sandbox: Sandbox
  readonly deck: Deck
}

/**
 * A test of real harnesses in NovaDeck's terminals, against the fake model: each setup's
 * pinned harness installed, seeded in a fresh sandbox and connected to NovaDeck. Once the
 * test ends it fails should any request have carried a real credential, tried a
 * harness's real host, or should the developer's own harness homes have changed.
 */
export const e2e = (...setups: AgentSetup[]) =>
  base.extend<{ e2e: E2E }>({
    e2e: async ({ resources }, use) => {
      const model = await startFakeModel({ dialects: setups.map((setup) => setup.dialect) })
      resources.defer(() => model.close())
      const bins = await Promise.all(setups.map((setup) => installHarness(setup.agent)))
      const sandbox = createSandbox({ proxy: model.proxy, bins })
      resources.defer(() => rmSync(sandbox.root, { recursive: true, force: true }))
      const changed = tripwire(sandbox)
      let env = sandbox.env
      for (const setup of setups)
        // eslint-disable-next-line no-await-in-loop -- Each setup sees what the ones before added.
        env = { ...env, ...(await setup.prepare({ ...sandbox, env }, model)) }
      const deck = await createDeck({
        data: join(sandbox.root, "data"),
        project: sandbox.project,
        env,
      })
      resources.defer(() => deck.close())
      for (const setup of setups)
        // eslint-disable-next-line no-await-in-loop -- One plugin command at a time, as the runner runs them.
        await deck.connect(setup.agent)
      for (const setup of setups)
        // eslint-disable-next-line no-await-in-loop -- As above.
        await setup.connected?.({ ...sandbox, env }, model)

      await use({ model, sandbox: { ...sandbox, env }, deck })

      // Checked once the test's own work is done, while every process is still up.
      const hosts = new Set(setups.flatMap((setup) => setup.hosts ?? []))
      const problems = [
        ...(model.foreign > 0
          ? [`${model.foreign} request(s) carried a credential other than the fake one`]
          : []),
        ...model.strays
          .filter((stray) => hosts.has(stray.split(" ")[1] ?? ""))
          .map((stray) => `a request tried the real API: ${stray}`),
        ...changed().map((path) => `the developer's harness home changed: ${path}`),
      ]
      if (problems.length > 0) throw new Error(problems.join("\n"))
    },
  })
