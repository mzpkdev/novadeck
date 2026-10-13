import { readdirSync } from "node:fs"
import { join } from "node:path"

const testFile = /(\.test\.|\.spec\.|\.e2e\.|\/e2e\/|\/testing\/|\/specs\/)/

// Repository-relative paths of the non-test source files under `dir`.
export const sourceFiles = (repo: string, dir: string): string[] =>
  readdirSync(join(repo, dir), { recursive: true, encoding: "utf8" })
    .map((entry) => `${dir}/${entry}`)
    .filter((file) => /\.tsx?$/.test(file) && !testFile.test(file))
    .toSorted()
