import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, posix } from "node:path"

import { describe, expect, it } from "./test"

// Every source file belongs to a layer: a folder ("model/") or a single file
// ("main.tsx"). Each layer lists what it may import from src. Every folder in
// backend/ is an adapter layer; see `adapterRule`.
const base = ["model/", "interaction/", "ui-toolkit/"]
const features = ["sidebar/", "projects/", "preferences/", "search/"]
const rules: Record<string, readonly string[]> = {
  "model/": ["model/"],
  "backend/": ["backend/", "model/"],
  "ui-toolkit/": ["ui-toolkit/", "class-name.ts"],
  "interaction/": ["interaction/", "model/"],
  ...Object.fromEntries(features.map((layer) => [layer, [...base, layer]])),
  "terminals/": [...base, "terminals/", "sidebar/"],
  "layouts/": [...base, "layouts/", "sidebar/", "terminals/"],
  "shell/": [...base, "shell/", "sidebar/", "terminals/", "layouts/", "projects/"],
  "app/": ["app/", "backend/", ...base, ...features, "terminals/", "layouts/", "shell/"],
  "specs/": ["specs/", "app/App.tsx", "styles.css"],
  // Entry point and support modules outside the feature layers.
  "main.tsx": ["app/", "styles.css"],
  "services/": ["services/"],
  "test/": ["test/", "model/"],
  "test.ts": [],
  "class-name.ts": [],
  "content-security-policy.ts": [],
  "environment.d.ts": [],
}
const adapterRule = (layer: string): readonly string[] => [
  layer,
  "backend/",
  "model/",
  "ui-toolkit/",
]
// The only file that may import a backend adapter.
const adapterSelection = "app/backend.ts"
// Layers that may not use packages at all, or only the listed ones as `import type`.
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

const src = join(process.cwd(), "src")
const files = (readdirSync(src, { recursive: true }) as string[])
  .map((file) => file.split("\\").join("/"))
  .filter((file) => /\.tsx?$/.test(file))
const source = (file: string): string => readFileSync(join(src, file), "utf8")
const importPattern =
  /(?:^(?:import|export)(\s+type)?\b[^"']*?\bfrom|^import|\bimport\()\s*(["'])([^"']+)\2/gm
const imports = (file: string) =>
  [...source(file).matchAll(importPattern)].map((match) => ({
    specifier: match[3]!,
    typeOnly: Boolean(match[1]),
  }))
const resolveFile = (file: string, specifier: string): string => {
  const target = posix.normalize(posix.join(posix.dirname(file), specifier))
  const candidates = [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`]
  const isFile = (path: string): boolean =>
    existsSync(join(src, path)) && statSync(join(src, path)).isFile()
  return candidates.find(isFile) ?? target
}
const isTest = (file: string): boolean => /\.test\.tsx?$/.test(file)
const rootTest = (file: string): boolean => isTest(file) && !file.includes("/")
const adapterOf = (file: string): string | undefined => /^backend\/[^/]+\//.exec(file)?.[0]
// The most specific layer wins, so backend/demo/ is not treated as backend/.
const layerOf = (file: string): string | undefined =>
  adapterOf(file) ??
  Object.keys(rules).reduce<string | undefined>(
    (found, layer) =>
      file.startsWith(layer) && layer.length > (found?.length ?? 0) ? layer : found,
    undefined,
  )
const allowedFor = (file: string, layer: string): readonly string[] => [
  ...(adapterOf(layer) ? adapterRule(layer) : rules[layer]!),
  ...(isTest(file) ? ["test/", "test.ts"] : []),
]
const packageName = (specifier: string): string =>
  specifier
    .split("/")
    .slice(0, specifier.startsWith("@") ? 2 : 1)
    .join("/")
const vendorOf = (specifier: string): string | undefined =>
  Object.keys(vendors).find((name) => specifier === name || specifier.startsWith(`${name}/`))

const importViolation = (file: string, layer: string | undefined) => {
  const allowed = layer ? allowedFor(file, layer) : []
  return ({ specifier, typeOnly }: { specifier: string; typeOnly: boolean }): string[] => {
    if (!specifier.startsWith(".")) {
      const limited = layer ? typeOnlyPackages[layer] : undefined
      if (!limited || isTest(file)) return []
      return limited.includes(packageName(specifier)) && typeOnly ? [] : [`${file} -> ${specifier}`]
    }
    const target = resolveFile(file, specifier)
    const targetLayer = layerOf(target)
    if (targetLayer && adapterOf(targetLayer) && targetLayer !== layer)
      return file === adapterSelection
        ? []
        : [`${file} -> ${target} (only ${adapterSelection} selects an adapter)`]
    // Root-level tests exercise the root modules beside them.
    if (!layer)
      return target.includes("/") && !target.startsWith("test/") ? [`${file} -> ${target}`] : []
    const ok = allowed.some(
      (entry) => target === entry || targetLayer === entry || target.startsWith(entry),
    )
    return ok ? [] : [`${file} -> ${target}`]
  }
}

describe("UI architecture", () => {
  it("places every source file in a layer", () => {
    expect(files.filter((file) => !layerOf(file) && !rootTest(file))).toEqual([])
  })

  it("keeps each layer to the layers it may import", () => {
    const found = files.flatMap((file) =>
      imports(file).flatMap(importViolation(file, layerOf(file))),
    )
    expect(found).toEqual([])
  })

  it("keeps vendor libraries inside their adapters", () => {
    const found = files.flatMap((file) =>
      imports(file).flatMap(({ specifier }) => {
        const vendor = vendorOf(specifier)
        return !vendor || vendors[vendor]!.some((owner) => file.startsWith(owner))
          ? []
          : [`${file} -> ${specifier}`]
      }),
    )
    expect(found).toEqual([])
  })

  it("has no rule that matches nothing", () => {
    const deadLayers = Object.keys(rules).filter(
      (layer) => !files.some((file) => file.startsWith(layer)),
    )
    const deadVendors = Object.entries(vendors).flatMap(([vendor, owners]) =>
      owners
        .filter(
          (owner) =>
            !files.some(
              (file) =>
                file.startsWith(owner) &&
                imports(file).some(({ specifier }) => vendorOf(specifier) === vendor),
            ),
        )
        .map((owner) => `${vendor} in ${owner}`),
    )
    expect([...deadLayers, ...deadVendors]).toEqual([])
  })

  it("keeps imports statically resolvable", () => {
    expect(files.filter((file) => /\bimport\(\s*`/.test(source(file)))).toEqual([])
  })

  it("names hook contracts instead of inferring them from the hook", () => {
    expect(files.filter((file) => /ReturnType<typeof use[A-Z]/.test(source(file)))).toEqual([])
  })
})
