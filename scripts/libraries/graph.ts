import { order } from "./order.ts"

// The package graph behind the import fence: a library's package.json may name, among the
// workspace's own packages, only the libraries its design depends on. pnpm's isolated
// linker already fails an import its package doesn't declare, so with this a library
// can't reach app code or another library through its dependencies either.

type Manifest = {
  readonly name: string
  readonly dependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
  readonly optionalDependencies?: Readonly<Record<string, string>>
}

const kinds = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const

/**
 * The workspace packages the library in `folder` (its name in libraries/) names in its
 * package.json outside its order, each as `kind name`: every `@novadeck/` one but the
 * libraries its design depends on. A library not in the order may name none.
 */
export const strayDependencies = (folder: string, manifest: Manifest): readonly string[] => {
  const allowed = new Set((order[folder] ?? []).map((name) => `@novadeck/${name}`))
  return kinds.flatMap((kind) =>
    Object.keys(manifest[kind] ?? {})
      .filter((name) => name.startsWith("@novadeck/") && !allowed.has(name))
      .map((name) => `${kind} ${name}`),
  )
}
