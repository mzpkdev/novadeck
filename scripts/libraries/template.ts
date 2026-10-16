// The files a new library starts with, as `pnpm new:library` writes them: a package of its
// own, with its own dependencies (nothing it imports may come from hoisting), its own Vitest
// config and its own README. See libraries/README.md for what a library may and may not do.

/** The dev tools a library pins, at the versions the workspace root uses. */
export type Versions = {
  readonly "@types/node": string
  readonly typescript: string
  readonly vitest: string
}

/** Whether `name` can name a library: lower-case words joined by hyphens. */
export const isLibraryName = (name: string): boolean => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

/** Each file of a new library, by its path inside `libraries/<name>/`. */
export const template = (
  name: string,
  description: string,
  versions: Versions,
): Readonly<Record<string, string>> => ({
  "package.json": json({
    name: `@novadeck/${name}`,
    version: "0.0.0",
    private: true,
    description,
    type: "module",
    sideEffects: false,
    exports: {
      ".": {
        development: "./src/index.ts",
        types: "./dist/index.d.ts",
        default: "./dist/index.js",
      },
    },
    scripts: {
      build: "tsc -p tsconfig.build.json",
      test: "vitest run",
      typecheck: "tsc --noEmit -p tsconfig.json",
    },
    devDependencies: {
      "@types/node": versions["@types/node"],
      typescript: versions.typescript,
      vitest: versions.vitest,
    },
  }),
  "tsconfig.json": json({ extends: "../../tsconfig.base.json", include: ["src/**/*.ts"] }),
  "tsconfig.build.json": json({
    extends: "./tsconfig.json",
    compilerOptions: {
      allowImportingTsExtensions: false,
      declaration: true,
      noEmit: false,
      outDir: "dist",
      rootDir: "src",
    },
    exclude: ["src/**/*.test.ts"],
  }),
  "vitest.config.ts": [
    'import { defineConfig } from "vitest/config"',
    "",
    "export default defineConfig({",
    "  test: {",
    '    include: ["src/**/*.test.ts"],',
    "  },",
    "})",
    "",
  ].join("\n"),
  "README.md": [
    `# @novadeck/${name}`,
    "",
    description,
    "",
    "## Subpaths",
    "",
    "- `.`: what the package's root exports.",
    "",
  ].join("\n"),
  "src/index.ts": "export {}\n",
})
