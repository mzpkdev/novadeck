import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { approvalTest, instrumentApproval } from "./agy-approval-instrument.ts"

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
export default {
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
    include: ["src/e2e/answers.e2e.ts"],
    testNamePattern: `^Antigravity > ${approvalTest}$`,
    testTimeout: 180_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
}
