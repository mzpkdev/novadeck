# Moving the UI's model into the core

`node scripts/core/move.ts` moves `application/ui/src/model/` into `application/ui/src/core/` with
the pieces that go with it, and points every importer at the new place. It computes its work from
the tree it finds, so it runs again on a fresh main after other pull requests change `model/`.

It moves:

- every tracked file under `ui/src/model/` to `ui/src/core/`, folders kept (`layout/` too);
- `backend/registry.ts` and `backend/portable-card-raised.ts`, and their tests, into `core/`;
- `backend/boot-rehearsal.ts` and its test into `backend/demo/debug/`.

It stops before changing anything, listing what it can't write for `#core/*` (a folder's index,
a `?raw` query, a template-literal `import()` or `import.meta.glob` into the moved folders). It rewrites
every quoted relative specifier in a tracked `.ts`/`.tsx` file that resolves to a file it
moved (`from`, `import()`, `import "x"`, `vi.mock("x")`, and the same with a `?raw` or `?worker`
query): importers in `ui/src` get `#core/<path>`, the package's own `imports` (`"#core/*":
"./src/core/*.ts"` in `application/ui/package.json`); files inside `core/` and files outside `ui/src`
get relative paths; the moved files' imports of what stayed behind are made relative to their new
place. A specifier it doesn't recognise as an import (a quoted path that is none of the forms
above) is printed for a look. Paths written out in scripts and docs (`ui/src/model/...`) are
rewritten as text (a regular expression's `ui\/src\/model\/` too). It runs `oxfmt` over what it touched, refuses a dirty tree, and refuses to run
when `ui/src/core/` exists.

## Redoing the move on a fresh main

The branch keeps its commits in this order so a redo is "re-apply the hand edits, then run":

1. **The prep commit** (hand edits that don't need the new folder): `model/derivations.ts`
   (the workspace-only selectors out of `app/selectors.ts`), `SchemePreference` defined in
   `model/types.ts`, the registry's `TerminalKey` taken from `model/types`, the `imports` field in
   `application/ui/package.json`. Merge or cherry-pick it onto the fresh main; it rarely conflicts.
2. **The script commit** (`scripts/core/`): cherry-pick it too; it is its own commit, not part of the prep.
3. Run `node scripts/core/move.ts` on a clean tree and commit its output.
4. **The architecture commit** (`architecture.test.ts` re-keyed for `core/`, `#core/*` read as the
   core layer, and the core's own rules): cherry-pick it; the tables it touches are additions, so
   conflicts are small. `architecture.test.ts` fails between steps 3 and 4 and only there.
5. **The docs commit** (README and docs prose, source comments and the atlas's area map and lens, which name `model/`); redo it by `grep` for what main brought new.

## What to check after

- The script ends by listing mentions of the old folder it didn't rewrite (a path without the
  `ui/` in front, such as `scripts/bench/profile/patches.ts`'s `/src/model/store.ts`): the docs
  commit fixes those.
- `grep -rn "model/" application/ui/src` for new mentions of the old folder in comments (the
  script rewrites specifiers and full paths, not prose).
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`, then `pnpm build`,
  `pnpm build:try` and `pnpm --filter @novadeck/ui exec vite build --mode content-preview --outDir <scratch>`.
- The counter run's reading is unchanged:
  `pnpm --filter @novadeck/ui exec vitest run --project counters`, then `node scripts/benchmark/main.ts`.
- If a new file in `model/` imports React, the toolkit or another UI layer, it can't move into
  `core/`: move it out to the UI first (the architecture rule fails otherwise).
