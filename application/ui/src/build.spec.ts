import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { context, describe, expect, it } from "./test"

const output = join(process.cwd(), "dist")
const read = (path: string): Promise<string> => readFile(join(output, path), "utf8")

describe("compiled frontend", () => {
  context("when loaded from a packaged directory", () => {
    it("references its assets with relative paths", async () => {
      const html = await read("index.html")
      const paths = [...html.matchAll(/(?:href|src)="(\.\/assets\/[^"]+)"/g)].flatMap((match) =>
        match[1] ? [match[1]] : [],
      )

      expect(paths).toHaveLength(2)
      await expect(
        Promise.all(paths.map((path) => read(path.replace(/^\.\//, "")))),
      ).resolves.toHaveLength(2)
    })
  })
})
