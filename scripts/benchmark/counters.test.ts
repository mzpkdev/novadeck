import { context, describe, expect, it } from "../test"
import {
  budgetChanges,
  changedScripts,
  checkCounters,
  countersSummary,
  parseBaseBudgets,
  parseBudgets,
  parseReading,
  tickChanges,
  type Budget,
  type Budgets,
  type Reading,
} from "./counters"

const phase = {
  ticks: 10,
  tickTotals: { notifications: 100, mutations: 20, commits: 10, renders: 400 },
  bytes: 500,
  written: 500,
  streamingPeak: 13,
  streamingSettled: 4,
}
const reading: Reading = { grid: phase, focus: phase, switches: phase }
const budget = {
  ticks: 10,
  notifications: 100,
  mutations: 20,
  bytes: 500,
  streamingPeak: 13,
  streamingSettled: 4,
}
const budgets: Budgets = { grid: budget, focus: budget, switches: budget }
// The budgets with Grid's mutations budget written as `entry`.
const withGridMutations = (entry: Budget, from: Budgets = budgets): Budgets => ({
  ...from,
  grid: { ...from.grid, mutations: entry },
})

describe("the counter run's budgets", () => {
  context("when every count meets its budget", () => {
    it("passes every counter", () => {
      expect(checkCounters(reading, budgets).every((row) => row.verdict === "within")).toBe(true)
    })
  })

  context("when a count goes past its budget", () => {
    it("fails that counter alone", () => {
      const worse = { ...reading, focus: { ...phase, streamingSettled: 5 } }
      expect(checkCounters(worse, budgets).filter((row) => row.verdict !== "within")).toEqual([
        { phase: "focus", counter: "streamingSettled", value: 5, budget: 4, verdict: "over" },
      ])
    })
  })

  context("when a count drops under its budget", () => {
    it("asks for the budget to come down", () => {
      const better = {
        ...reading,
        grid: { ...phase, tickTotals: { ...phase.tickTotals, notifications: 40 } },
      }
      const rows = checkCounters(better, budgets)
      expect(rows.find((row) => row.verdict === "under")).toMatchObject({
        phase: "grid",
        counter: "notifications",
      })
      expect(countersSummary(better, rows)).toContain("lower the budget")
    })
  })

  context("when the framework's cost rises", () => {
    it("reports it without failing", () => {
      const costlier = {
        ...reading,
        grid: { ...phase, tickTotals: { ...phase.tickTotals, renders: 9_000 } },
      }
      const rows = checkCounters(costlier, budgets)
      expect(rows.every((row) => row.verdict === "within")).toBe(true)
      expect(countersSummary(costlier, rows)).toContain("| grid | 10 | 1.0 | 900.0 |")
    })
  })

  context("when the script plays another number of ticks", () => {
    it("fails until the budgets are set for it", () => {
      const longer = { ...reading, switches: { ...phase, ticks: 12 } }
      expect(changedScripts(longer, budgets)).toEqual([
        expect.stringContaining("switches played 12 ticks"),
      ])
      expect(changedScripts(reading, budgets)).toEqual([])
    })
  })

  context("when a file can't be read whole", () => {
    it("fails on a missing budget, naming the file", () => {
      const { streamingPeak: _, ...partial } = budget
      expect(() => parseBudgets({ ...budgets, switches: partial }, "budgets.json")).toThrow(
        "budgets.json's switches streamingPeak is not a whole-number budget.",
      )
    })

    it("fails on a budget that isn't a whole number", () => {
      expect(() =>
        parseBudgets(withGridMutations({ budget: 20.5, reason: "r", from: "#1" }), "base"),
      ).toThrow("base's grid mutations is not a whole-number budget.")
    })

    it("fails on a phase without its ticks", () => {
      const { ticks: _, ...untimed } = budget
      expect(() => parseBudgets({ ...budgets, focus: untimed }, "budgets.json")).toThrow(
        "budgets.json doesn't say how many ticks focus plays.",
      )
    })

    it("fails on a reading without a phase, or its counts", () => {
      const { switches: _, ...partial } = reading
      expect(() => parseReading(partial)).toThrow("The reading has no switches phase.")
      expect(() => parseReading({ ...reading, grid: { ...phase, tickTotals: null } })).toThrow(
        "The reading's grid phase has no ticks.",
      )
      expect(() => parseReading(null)).toThrow("The reading is not an object.")
    })

    it("reads a whole file as it is", () => {
      expect(parseReading(reading)).toBe(reading)
      expect(parseBudgets(budgets, "budgets.json")).toBe(budgets)
    })
  })

  context("when a pull request raises a budget", () => {
    it("lets it stand with a reason and where it came from, old to new", () => {
      const next = withGridMutations({
        budget: 30,
        reason: "A live readout per terminal",
        from: "#240",
      })
      const changes = budgetChanges(next, budgets)
      expect(changes).toEqual([
        {
          phase: "grid",
          counter: "mutations",
          from: 20,
          to: 30,
          reason: "A live readout per terminal",
          source: "#240",
        },
      ])
      const worse = {
        ...reading,
        grid: { ...phase, tickTotals: { ...phase.tickTotals, mutations: 30 } },
      }
      const rows = checkCounters(worse, next)
      expect(rows.every((row) => row.verdict === "within")).toBe(true)
      expect(countersSummary(worse, rows, { changes })).toContain(
        "| grid | mutations | 20 → 30 | A live readout per terminal | #240 |",
      )
    })

    it("refuses a bare number", () => {
      expect(budgetChanges(withGridMutations(30), budgets)[0]?.problem).toBeDefined()
    })

    it("refuses a raise that doesn't say where it came from", () => {
      const next = withGridMutations({ budget: 30, reason: "A readout", from: " " })
      expect(budgetChanges(next, budgets)[0]?.problem).toBeDefined()
    })

    it("refuses a raise that names the earlier raise's source", () => {
      const base = withGridMutations({ budget: 30, reason: "A readout", from: "#240" })
      const next = withGridMutations({ budget: 45, reason: "A readout", from: "#240" })
      expect(budgetChanges(next, base)[0]?.problem).toContain("earlier raise's source")
      const own = withGridMutations({ budget: 45, reason: "Two readouts", from: "#251" })
      expect(budgetChanges(own, base)[0]?.problem).toBeUndefined()
    })

    it("keeps a reason that would break the table to its own cell", () => {
      const next = withGridMutations({ budget: 30, reason: "A | B\nand C", from: "#240" })
      const changes = budgetChanges(next, budgets)
      expect(countersSummary(reading, checkCounters(reading, next), { changes })).toContain(
        "| A \\| B and C | #240 |",
      )
    })
  })

  context("when a pull request lowers a budget", () => {
    it("shows it, needing no reason", () => {
      const changes = budgetChanges({ ...budgets, focus: { ...budget, bytes: 100 } }, budgets)
      expect(changes).toEqual([{ phase: "focus", counter: "bytes", from: 500, to: 100 }])
      expect(countersSummary(reading, checkCounters(reading, budgets), { changes })).toContain(
        "| focus | bytes | 500 → 100 | lowered |  |",
      )
    })
  })

  context("when no budget changes", () => {
    it("says nothing of changes", () => {
      expect(budgetChanges(budgets, budgets)).toEqual([])
      expect(countersSummary(reading, checkCounters(reading, budgets))).not.toContain(
        "changes budgets",
      )
    })
  })

  context("when there is no base to compare with", () => {
    it("says budget changes went unchecked", () => {
      expect(
        countersSummary(reading, checkCounters(reading, budgets), { compared: false }),
      ).toContain("budget changes aren't checked")
    })
  })

  context("when the change is in a pull request", () => {
    it("asks a raise to name that pull request", () => {
      const next = withGridMutations({ budget: 30, reason: "A readout", from: "#240" })
      expect(budgetChanges(next, budgets, 251)[0]?.problem).toContain("This raise is in #251")
      const own = withGridMutations({ budget: 30, reason: "A readout", from: "#251, #240" })
      expect(budgetChanges(own, budgets, 251)[0]?.problem).toBeUndefined()
      const longer = withGridMutations({ budget: 30, reason: "A readout", from: "#2510" })
      expect(budgetChanges(longer, budgets, 251)[0]?.problem).toBeDefined()
    })
  })

  context("when the base branch's budgets are in an older form", () => {
    it("compares the budgets both have, so a change of form can land", () => {
      const { ticks: _, streamingPeak: __, ...older } = budget
      const base = parseBaseBudgets({ grid: older, focus: older }, "base")
      const next = { ...budgets, grid: { ...budget, streamingPeak: 99 } }
      expect(budgetChanges(next, base)).toEqual([])
      expect(tickChanges(next, base)).toEqual([])
    })

    it("still fails on a budget it has that doesn't read", () => {
      expect(() => parseBaseBudgets({ grid: { mutations: "20" } }, "base")).toThrow(
        "base's grid mutations is not a whole-number budget.",
      )
    })
  })

  context("when the script's ticks change with the budgets", () => {
    it("says so beside the budgets that changed", () => {
      const next = { ...budgets, switches: { ...budget, ticks: 12 } }
      const tickNotes = tickChanges(next, budgets)
      expect(tickNotes).toEqual(["switches now plays 12 ticks, was 10"])
      expect(countersSummary(reading, checkCounters(reading, next), { tickNotes })).toContain(
        "- switches now plays 12 ticks, was 10: its counts are totals over the new number.",
      )
    })
  })
})
