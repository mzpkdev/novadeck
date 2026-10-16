# Libraries

The mechanics the app is built on, each a package that never imports app code: hosting
terminals, the emulator, typing into TUIs, the transport between processes, the content viewers,
the build rules and the test sandbox. The app keeps the product.

## The rules

- **No app code.** A library never imports `@novadeck/protocol`, the runner, the UI, the host,
  the relay, the atlas or a harness, by package name or by path. Product specifics (names,
  wording, environment variables, storage keys) come in as options. A library's README reads
  the same with "Novadeck" taken out.
- **Other libraries in order only.** A library imports another one by its package name, and only
  the ones its design depends on: `terminal` and `tui-input` import `emulator`, and `emulator`,
  `wire`, `viewers`, `sandbox` and `build-kit` import none.
- **Node and browser halves are subpaths of one package.** A subpath only Node may import names
  nothing but the `node` condition in `exports`, so a browser bundle can't resolve it:

  ```json
  "./pty": { "node": { "development": "./src/pty.ts", "types": "./dist/pty.d.ts", "default": "./dist/pty.js" } }
  ```

  Every other subpath is a browser subpath. Native, server and Electron dependencies (node-pty,
  `ws`, `@orpc/server`, `electron`) are optional peer dependencies, installed by the app that
  uses those subpaths.

- **Its own package.** Every dependency it imports is in its own `package.json`, never borrowed
  from hoisting, and it keeps its own pins, patches, tests and README. pnpm reads
  `patchedDependencies` only from the root `pnpm-workspace.yaml`, so a library's patch files live
  in the library and are registered there.

## What enforces them

- **The import fence** in `.oxlintrc.json`: an override per library refuses app code, paths into
  `application/`, `harnesses/` and `libraries/`, and the libraries outside its order; one on
  `application/ui/src` refuses the libraries' Node subpaths (`/pty`, `/host`, `/server`,
  `/electron`, `/browser/host`). oxlint takes `no-restricted-imports` from the last matching
  override alone, so each library's override repeats the bans they all share, and
  `scripts/harnesses/fence.test.ts` lints probe files with the real config to check what each
  file ends up with.
- **The browser build check** (`scripts/libraries/browser.test.ts`): the lint sees direct imports
  only, so each library's browser subpaths are bundled for the browser, and the check fails on
  any Node built-in, native module or unresolvable package they pull in.
- **The build's `rootDir`**: a relative import that leaves the library's `src` fails `tsc`.

## Adding a library

```sh
pnpm new:library <name> <description>
pnpm install
```

It writes `libraries/<name>` from `scripts/libraries/template.ts`: a `package.json` with its own
dev tools, `tsconfig.json` on the shared `tsconfig.base.json`, a build config, a Vitest config and
a README. Then fence it in: add it to `order` in `scripts/harnesses/fence.test.ts`, give it an
override in `.oxlintrc.json` like its neighbours', and add it to the list each other library's
override refuses. The fence test fails until a folder here is in its order, and until each
override refuses what the order says.
