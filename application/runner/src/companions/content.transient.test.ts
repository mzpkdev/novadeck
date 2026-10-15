import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { vi } from "vitest"

import { describe, expect, it as base } from "../test.js"

const it = base.extend<{ directory: string }>({
  directory: async ({ resources }, use) => {
    const directory = realpathSync.native(mkdtempSync(join(tmpdir(), "novadeck-save-")))
    resources.defer(() => rmSync(directory, { recursive: true, force: true }))
    await use(directory)
  },
})

// A failure of the disk that may pass, which a real folder can't be made to give.
const failure = vi.hoisted(() => ({ code: undefined as string | undefined }))

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>()
  return {
    ...actual,
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (failure.code) throw Object.assign(new Error(failure.code), { code: failure.code })
      return actual.rename(...args)
    },
  }
})

import { DomainError } from "../errors.js"

const { readPlanFile, savePlan } = await import("./content.js")

describe("saving a plan when the disk fails", () => {
  const plan = (path: string) =>
    ({ path, plan: { agent: "claude", session: "s", actor: null, format: "file" } }) as const

  for (const code of ["EIO", "ENOSPC", "EBUSY"])
    it(`leaves ${code} unclassified and no temporary file behind`, async ({ directory }) => {
      const path = join(directory, "p.md")
      writeFileSync(path, "# Plan\n")
      const stamp = (await readPlanFile(path))?.stamp ?? ""
      failure.code = code
      try {
        const error = await savePlan(plan(path), "# Edited\n", stamp).catch((caught) => caught)
        expect(error).toMatchObject({ code })
        expect(error).not.toBeInstanceOf(DomainError)
      } finally {
        failure.code = undefined
      }
      expect(readdirSync(directory)).toEqual(["p.md"])
      expect(readFileSync(path, "utf8")).toBe("# Plan\n")
    })

  for (const code of ["EACCES", "EPERM", "EROFS"])
    it(`names ${code} as a folder it can't write`, async ({ directory }) => {
      const path = join(directory, "p.md")
      writeFileSync(path, "# Plan\n")
      const stamp = (await readPlanFile(path))?.stamp ?? ""
      failure.code = code
      try {
        await expect(savePlan(plan(path), "# Edited\n", stamp)).rejects.toMatchObject({
          code: "PLAN_UNWRITABLE",
          data: { reason: "folder" },
        })
      } finally {
        failure.code = undefined
      }
      expect(readdirSync(directory)).toEqual(["p.md"])
    })
})
