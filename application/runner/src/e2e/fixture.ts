import { rmSync } from "node:fs"
import { join } from "node:path"

import { beforeAll } from "vitest"

import { it as base } from "../test.js"
import type { AgentSetup } from "./agents/agent.js"
import { createDeck, type Deck } from "./deck.js"
import { installHarness } from "./install.js"
import { startFakeModel, type FakeModel } from "./model/server.js"
import { createSandbox, reap, tripwire, type Sandbox } from "./sandbox.js"

export { describe, expect } from "../test.js"

/**
 * Whether the suite can run here: Linux only. Elsewhere the sandbox's dead D-Bus address
 * doesn't keep a harness from the developer's keyring, as the macOS Keychain needs no
 * bus, and the leftover-process check reads /proc. A scenario file can skip on it
 * (`describe.skipIf(!supported)`); a test that runs anyway fails, saying why.
 */
export const supported = process.platform === "linux"

export type E2E = {
  readonly model: FakeModel
  readonly sandbox: Sandbox
  readonly deck: Deck
}

/**
 * A test of real harnesses in NovaDeck's terminals, against the fake model: each setup's
 * pinned harness installed, seeded in a fresh sandbox and connected to NovaDeck. The
 * harnesses are installed once, before the file's tests, so a download counts against
 * the hook timeout rather than a test's. Once the test ends and its deck has closed, with
 * the fake model still listening for whatever a harness sends on its way out, the test
 * fails should any request have carried a real credential, tried a harness's real host or
 * tripped a dialect, should the developer's own harness homes have changed, or should any
 * process have outlived the deck in the sandbox.
 */
export const e2e = (...setups: AgentSetup[]) => {
  beforeAll(async () => {
    if (supported) await Promise.all(setups.map((setup) => installHarness(setup.agent)))
  })
  return base.extend<{ e2e: E2E }>({
    e2e: async ({ resources }, use) => {
      if (!supported)
        throw new Error(
          `The end-to-end suite runs on Linux only, not ${process.platform}: elsewhere nothing keeps a harness from the developer's keyring`,
        )
      const model = await startFakeModel({ dialects: setups.map((setup) => setup.dialect) })
      resources.defer(() => model.close())
      // Installed before the file's tests: these are the same installs, already done.
      const bins = await Promise.all(setups.map((setup) => installHarness(setup.agent)))
      const sandbox = createSandbox({ proxy: model.proxy, bins })
      resources.defer(() =>
        rmSync(sandbox.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
      )
      // Whatever happens, nothing the test started outlives it.
      resources.defer(async () => {
        await reap(sandbox)
      })
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
      let open = true
      const close = async () => {
        if (!open) return
        open = false
        await deck.close()
      }
      resources.defer(close)
      for (const setup of setups)
        // eslint-disable-next-line no-await-in-loop -- One plugin command at a time, as the runner runs them.
        await deck.connect(setup.agent)
      for (const setup of setups)
        // eslint-disable-next-line no-await-in-loop -- As above.
        await setup.connected?.({ ...sandbox, env }, model)

      await use({ model, sandbox: { ...sandbox, env }, deck })

      // Checked once the deck has closed, so what a harness sends as it exits counts too,
      // while the fake model still listens.
      await close()
      const leftovers = await reap(sandbox)
      const hosts = new Set(setups.flatMap((setup) => setup.hosts ?? []))
      const problems = [
        ...(model.foreign > 0
          ? [`${model.foreign} request(s) carried a credential other than the fake one`]
          : []),
        ...model.strays
          .filter((stray) => hosts.has(stray.split(" ")[1] ?? ""))
          .map((stray) => `a request tried the real API: ${stray}`),
        ...model.errors.map((error) => `the fake model failed on a request: ${error}`),
        ...changed().map((path) => `the developer's harness home changed: ${path}`),
        ...leftovers.map((one) => `a process outlived the deck in the sandbox: ${one}`),
      ]
      await model.close()
      if (problems.length > 0) throw new Error(problems.join("\n"))
    },
  })
}
