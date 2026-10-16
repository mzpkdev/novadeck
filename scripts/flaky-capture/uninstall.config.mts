import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import base from "../../application/ui/vitest.config.ts"
import { instrumentUninstall } from "./uninstall-instrument.ts"

const root = fileURLToPath(new URL("../../application/ui/", import.meta.url))
const repo = fileURLToPath(new URL("../../", import.meta.url))
const output = process.env.NOVADECK_UNINSTALL_OUTPUT
if (!output) throw new Error("Run uninstall capture through scripts/flaky-capture/uninstall.ts")
const behaviour = base.test.projects[1]
const events = fileURLToPath(new URL("./uninstall-events.mjs", import.meta.url))
const sha256 = (text) => createHash("sha256").update(text).digest("hex")
mkdirSync(join(output, "transforms"), { recursive: true })

export default {
  ...base,
  root,
  server: { ...base.server, fs: { allow: [repo, output] } },
  plugins: [
    ...base.plugins,
    {
      name: "uninstall-capture-boundaries",
      enforce: "pre",
      transform(source, id) {
        const result = instrumentUninstall(source, id, events)
        if (!result) return undefined
        writeFileSync(
          join(output, "transforms", `${result.name}.json`),
          JSON.stringify(
            {
              file: result.file,
              incomingSourceSha256: sha256(source),
              transformedSourceSha256: sha256(result.code),
            },
            null,
            2,
          ) + "\n",
        )
        return result.code
      },
    },
  ],
  test: {
    ...base.test,
    attachmentsDir: join(output, "attachments"),
    projects: [
      {
        ...behaviour,
        test: {
          ...behaviour.test,
          include: ["src/specs/uninstall.spec.tsx"],
          setupFiles: [
            ...behaviour.test.setupFiles,
            fileURLToPath(new URL("./uninstall.setup.mjs", import.meta.url)),
          ],
          browser: {
            ...behaviour.test.browser,
            screenshotFailures: true,
            trace: { mode: "retain-on-failure", tracesDir: join(output, "traces") },
            commands: {
              ...behaviour.test.browser.commands,
              uninstallCapture: async ({ page }, capture) => {
                if (!Number.isInteger(capture.index) || capture.index < 1 || capture.index > 100)
                  throw new Error("Invalid uninstall capture case index")
                await writeFile(
                  join(output, `case-${String(capture.index).padStart(2, "0")}.json`),
                  JSON.stringify(capture, null, 2) + "\n",
                )
                await writeFile(
                  join(output, "browser.json"),
                  JSON.stringify(
                    { version: page.context().browser()?.version(), viewport: page.viewportSize() },
                    null,
                    2,
                  ) + "\n",
                )
              },
            },
          },
        },
      },
    ],
  },
}
