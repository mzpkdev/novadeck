import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, posix } from "node:path"

import { describe, expect, it } from "./test"

// Folder layers and what each may import from src. Files outside a layer
// (entry point, services, test support) are not constrained as importers.
const base = ["model/", "interaction/", "ui-toolkit/"]
const features = ["sidebar/", "projects/", "preferences/", "search/"]
const rules: Record<string, readonly string[]> = {
  "model/": ["model/"],
  "backend/": ["backend/", "model/"],
  "backend/demo/": ["backend/demo/", "backend/", "model/", "ui-toolkit/"],
  "ui-toolkit/": ["ui-toolkit/", "class-name.ts"],
  "interaction/": ["interaction/", "model/"],
  ...Object.fromEntries(features.map((layer) => [layer, [...base, layer]])),
  "terminals/": [...base, "terminals/", "sidebar/"],
  "layouts/": [...base, "layouts/", "sidebar/", "terminals/"],
  "shell/": [...base, "shell/", "sidebar/", "terminals/", "layouts/", "projects/"],
  "app/": ["app/", "backend/", ...base, ...features, "terminals/", "layouts/", "shell/"],
  "specs/": ["specs/", "app/App.tsx", "styles.css"],
}
// Packages a layer may not use at all, or only as `import type`.
const typeOnlyPackages: Record<string, readonly string[]> = { "model/": [], "backend/": ["react"] }
const vendors: Record<string, readonly string[]> = {
  "@ark-ui": ["ui-toolkit/"],
  "@xyflow/react": ["layouts/canvas/"],
  "react-grid-layout": ["layouts/grid/"],
  allotment: ["shell/"],
  "@dnd-kit": ["terminals/"],
  "react-router": ["app/", "shell/"],
  "react-dom": ["layouts/transition.ts", "main.tsx"],
}
const adapterSelection = "app/backend.ts"

const src = join(process.cwd(), "src")
const files = (readdirSync(src, { recursive: true }) as string[])
  .map((file) => file.split("\\").join("/"))
  .filter((file) => /\.tsx?$/.test(file))
const importPattern =
  /(?:^(?:import|export)(\s+type)?\b[^"]*?\bfrom|^import|\bimport\()\s*"([^"]+)"/gm
const imports = (file: string) =>
  [...readFileSync(join(src, file), "utf8").matchAll(importPattern)].map((match) => ({
    specifier: match[2]!,
    typeOnly: Boolean(match[1]),
  }))
const resolveFile = (file: string, specifier: string): string => {
  const target = posix.normalize(posix.join(posix.dirname(file), specifier))
  const candidates = [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`]
  return (
    candidates.find((path) => existsSync(join(src, path)) && statSync(join(src, path)).isFile()) ??
    target
  )
}
// The most specific layer wins, so backend/demo/ is not treated as backend/.
const layerOf = (file: string): string | undefined =>
  Object.keys(rules).reduce<string | undefined>(
    (found, layer) =>
      file.startsWith(layer) && layer.length > (found?.length ?? 0) ? layer : found,
    undefined,
  )
const isTest = (file: string): boolean => file.endsWith(".test.ts")
const packageName = (specifier: string): string =>
  specifier
    .split("/")
    .slice(0, specifier.startsWith("@") ? 2 : 1)
    .join("/")

const violations = (check: (file: string) => string[]): string[] => files.flatMap(check)

describe("UI architecture", () => {
  it("keeps each layer to the layers it may import", () => {
    const found = violations((file) => {
      const layer = layerOf(file)
      if (!layer) return []
      const allowed = [...rules[layer]!, ...(isTest(file) ? ["test/", "test.ts"] : [])]
      return imports(file).flatMap(({ specifier, typeOnly }) => {
        if (!specifier.startsWith(".")) {
          const limited = typeOnlyPackages[layer]
          if (!limited || isTest(file)) return []
          return limited.includes(packageName(specifier)) && typeOnly
            ? []
            : [`${file} -> ${specifier}`]
        }
        const target = resolveFile(file, specifier)
        const adapter = /^backend\/[^/]+\//.test(target)
        if (adapter && layer === "app/")
          return file === adapterSelection
            ? []
            : [`${file} -> ${target} (only ${adapterSelection} selects an adapter)`]
        const ok = allowed.some((entry) => target === entry || layerOf(target) === entry)
        return ok || (!layerOf(target) && allowed.some((entry) => target.startsWith(entry)))
          ? []
          : [`${file} -> ${target}`]
      })
    })
    expect(found).toEqual([])
  })

  it("keeps vendor libraries inside their adapters", () => {
    const found = violations((file) =>
      imports(file).flatMap(({ specifier }) => {
        const owners = vendors[packageName(specifier)]
        return !owners || owners.some((owner) => file.startsWith(owner))
          ? []
          : [`${file} -> ${specifier}`]
      }),
    )
    expect(found).toEqual([])
  })

  it("names hook contracts instead of inferring them from the hook", () => {
    const found = files.filter((file) =>
      /ReturnType<typeof use[A-Z]/.test(readFileSync(join(src, file), "utf8")),
    )
    expect(found).toEqual([])
  })
})
