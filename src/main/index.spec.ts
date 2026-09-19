import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { context, describe, expect, it } from "../test"

const output = join(process.cwd(), "out")
const read = (path: string): Promise<string> => readFile(join(output, path), "utf8")

describe("compiled application", () => {
  context("after the production build", () => {
    it("keeps the application identity and preload entry in the main process", async () => {
      const main = await read("main/index.js")

      expect(main).toContain('const appId = "dev.mzpk.novadeck"')
      expect(main).toContain('"../preload/index.mjs"')
    })

    it("exposes the typed renderer bridge from the preload process", async () => {
      const preload = await read("preload/index.mjs")

      expect(preload).toContain('contextBridge.exposeInMainWorld("novadeck", api)')
    })

    it("emits the renderer and its referenced assets", async () => {
      const html = await read("renderer/index.html")
      const paths = [...html.matchAll(/(?:href|src)="\.\/(assets\/[^"]+)"/g)].map(
        ([, path]) => path,
      )

      expect(paths).toHaveLength(2)
      await expect(
        Promise.all(paths.map((path) => read(`renderer/${path}`))),
      ).resolves.toHaveLength(2)
    })
  })
})
