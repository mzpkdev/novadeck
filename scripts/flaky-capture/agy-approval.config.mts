import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import original from "../../application/runner/vitest.e2e.config.ts"
import { approvalTest, instrumentApproval } from "./agy-approval-instrument.ts"
import ApprovalInventory from "./agy-approval-reporter.ts"

const root = fileURLToPath(new URL("../../application/runner/", import.meta.url))
const events = fileURLToPath(new URL("./agy-approval-events.ts", import.meta.url))
const recorder = fileURLToPath(
  new URL("../../application/runner/src/e2e/probes/agy-approval-capture.ts", import.meta.url),
)
const hash = (text) => createHash("sha256").update(text).digest("hex")
const output = process.env.NOVADECK_AGY_APPROVAL_OUTPUT
if (!output || process.env.NOVADECK_AGY_APPROVAL_CAPTURE !== "1")
  throw new Error("Run AGY approval capture through scripts/flaky-capture/agy-approval.ts")
mkdirSync(join(output, "transforms"), { recursive: true })
const suite = process.env.NOVADECK_AGY_APPROVAL_SCOPE === "suite"
export default {
  ...original,
  root,
  plugins: [
    {
      name: "agy-approval-capture",
      enforce: "pre",
      transform(source, id) {
        const result = instrumentApproval(source, id, events, recorder)
        if (!result) return undefined
        writeFileSync(
          join(output, "transforms", `${result.name}.json`),
          JSON.stringify(
            {
              file: result.file,
              incomingSourceSha256: hash(source),
              transformedSourceSha256: hash(result.code),
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
    ...original.test,
    ...(suite
      ? {}
      : {
          include: ["src/e2e/answers.e2e.ts"],
          testNamePattern: `^Antigravity > ${approvalTest}$`,
        }),
    reporters: ["default", "json", ...(suite ? [new ApprovalInventory()] : [])],
    outputFile: { json: join(output, "tests.json") },
  },
}
