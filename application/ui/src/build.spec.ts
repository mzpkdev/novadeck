import { readFile, readdir } from "node:fs/promises"
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

    it("contains a production Content Security Policy", async () => {
      const html = await read("index.html")

      expect(html).toContain("connect-src 'self' http://127.0.0.1:*")
      expect(html).not.toContain("__NOVADECK_CONNECT_SOURCES__")
      expect(html).not.toContain("ws:")
    })

    it("compiles Tailwind utilities against the design-system tokens", async () => {
      const assets = await readdir(join(output, "assets"))
      const stylesheet = assets.find((asset) => asset.endsWith(".css"))

      if (!stylesheet) throw new Error("The frontend build did not emit a stylesheet")

      const css = await read(`assets/${stylesheet}`)

      expect(css).toContain("--color__background")
      expect(css).toContain("background-color:var(--color__background)")
      expect(css).toMatch(/@layer novadeck\.recipes\{@scope\(\.novadeck\)\{\.card/)
      expect(css).toContain("transition-property:transform,translate,scale,rotate")
    })

    it("does not rely on an application stylesheet", async () => {
      const source = await readdir(join(process.cwd(), "src"), { recursive: true })

      expect(source.filter((file) => file.endsWith(".css"))).toEqual([])
    })
  })
})
