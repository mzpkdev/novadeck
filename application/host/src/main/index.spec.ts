import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { context, describe, expect, it } from "../test"

const output = join(process.cwd(), "out")
const read = (path: string): Promise<string> => readFile(join(output, path), "utf8")

describe("compiled desktop host", () => {
  context("after the production build", () => {
    it("keeps the application identity and starts the embedded runtime", async () => {
      const main = await read("main/index.js")

      expect(main).toContain('const appId = "dev.mzpk.novadeck"')
      expect(main).toContain("startRuntime")
      expect(main).toContain('join(process.resourcesPath, "ui", "index.html")')
      expect(main).toContain("loadFile")
    })

    it("blocks renderer navigation and denies permissions by default", async () => {
      const main = await read("main/index.js")

      expect(main).toContain('webContents.on("will-navigate"')
      expect(main).toContain("setPermissionCheckHandler")
      expect(main).toContain("setPermissionRequestHandler")
    })
  })
})
