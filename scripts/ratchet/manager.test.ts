import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  budgetsPath,
  countManager,
  managerPath,
  ratchetProblems,
  type Budgets,
  type Counts,
} from "./manager"

// application/runner/src/terminals/manager.ts holds a budget of lines and of functions in
// its Terminals class that only goes down: new behaviour goes in a sibling module under
// terminals/, and the class calls it.

const root = join(import.meta.dirname, "..", "..")
const read = (path: string): string => readFileSync(join(root, path), "utf8")

// The budgets as the base branch has them, where git can see it; a shallow checkout or a
// base without the file has none to compare with.
const baseBudgets = (): Budgets | undefined => {
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
  for (const branch of ["origin/main", "main"]) {
    try {
      const base = git("merge-base", "HEAD", branch).trim()
      return JSON.parse(git("show", `${base}:${budgetsPath}`)) as Budgets
    } catch {
      // Not this branch: try the next, or compare with none.
    }
  }
  return undefined
}

describe("manager.ts", () => {
  it("stays within its budgets, which come down as it shrinks", () => {
    const budgets = JSON.parse(read(budgetsPath)) as Budgets
    expect(ratchetProblems(countManager(read(managerPath)), budgets, baseBudgets())).toEqual([])
  })
})

describe("counting the Terminals class", () => {
  const terminals = `
    import type { Thing } from "./thing"
    const helper = (): void => {}
    export class Terminals {
      private readonly items = new Map<string, Thing>()
      private count = 0
      private readonly onExit = (code: number): void => {}
      private readonly onData = function (data: string): void {}
      constructor(name: string = "x") {}
      get size(): number { return this.items.size }
      set size(value: number) {}
      open(id: string): void { helper() }
      async close(id: string): Promise<void> {}
      static create(): Terminals { return new Terminals() }
    }
    class Other { method(): void {} }
  `

  it("counts every function its body defines, and nothing outside it", () => {
    expect(countManager(terminals).methods).toBe(8)
  })

  it("counts the same however the code is laid out", () => {
    const spread = terminals.replaceAll("(", "(\n\n").replaceAll("{", "{ // note\n")
    expect(countManager(spread).methods).toBe(countManager(terminals).methods)
  })

  it("counts the file's lines, a last newline or none", () => {
    expect(countManager("export class Terminals {}\n").lines).toBe(1)
    expect(countManager("// a\nexport class Terminals {}").lines).toBe(2)
  })

  it("refuses a file without one Terminals class", () => {
    expect(() => countManager("export class Other {}")).toThrow(/one Terminals class/)
  })

  it("refuses syntax it can't read, saying what to write instead", () => {
    const enumerated = "enum Kind { A }\nexport class Terminals {}"
    expect(() => countManager(enumerated)).toThrow(/without enums, namespaces or parameter/)
  })
})

describe("the ratchet", () => {
  const counts: Counts = { lines: 100, methods: 10 }
  const budgets: Budgets = { lines: 100, methods: 10 }

  it("holds while the counts meet their budgets", () => {
    expect(ratchetProblems(counts, budgets)).toEqual([])
  })

  it("sends new code past a budget to a sibling module under terminals/", () => {
    const [problem] = ratchetProblems({ ...counts, methods: 11 }, budgets)
    expect(problem).toMatch(/11 functions in the Terminals class, past its budget of 10/)
    expect(problem).toMatch(/sibling module under application\/runner\/src\/terminals\//)
  })

  it("asks for a budget to come down once the file shrinks under it", () => {
    expect(ratchetProblems({ ...counts, lines: 90 }, budgets)).toEqual([
      expect.stringMatching(/90 lines, under its budget of 100: lower the budget .* to 90/),
    ])
  })

  it("lets a raise stand with why and where it came from", () => {
    const raised: Budgets = {
      ...budgets,
      methods: { budget: 11, reason: "A new protocol call", from: "#240" },
    }
    expect(ratchetProblems({ ...counts, methods: 11 }, raised, budgets)).toEqual([])
  })

  it("refuses a raise that doesn't say why or where it came from", () => {
    expect(
      ratchetProblems({ ...counts, methods: 11 }, { ...budgets, methods: 11 }, budgets),
    ).toEqual([expect.stringMatching(/raises methods from 10 to 11 without saying why/)])
    const unsaid: Budgets = { ...budgets, methods: { budget: 11, reason: " ", from: "#240" } }
    expect(ratchetProblems({ ...counts, methods: 11 }, unsaid, budgets)).toEqual([
      expect.stringMatching(
        /is written \{ "budget": n, "reason": "why", "from": "#PR or commit" \}/,
      ),
    ])
  })

  it("lets a budget come down with no reason", () => {
    const lowered: Budgets = { ...budgets, lines: 90 }
    expect(ratchetProblems({ ...counts, lines: 90 }, lowered, budgets)).toEqual([])
  })
})
