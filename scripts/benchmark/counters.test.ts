import { context, describe, expect, it } from "../test"
import {
  budgetChanges,
  checkCounters,
  countersSummary,
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
  notifications: 100,
  mutations: 20,
  bytes: 500,
  streamingPeak: 13,
  streamingSettled: 4,
}
const budgets: Budgets = { grid: budget, focus: budget, switches: budget }

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

  context("when a counter can't be read", () => {
    it("fails on a missing budget", () => {
      const { streamingPeak: _, ...partial } = budget
      expect(() =>
        checkCounters(reading, { ...budgets, switches: partial as typeof budget }),
      ).toThrow("No budget is set for switches streamingPeak.")
    })

    it("fails on a missing phase", () => {
      const { switches: _, ...partial } = reading
      expect(() => checkCounters(partial as Reading, budgets)).toThrow("no switches phase")
    })
  })

  context("when a pull request raises a budget", () => {
    const raised = (entry: Budgets["grid"]["mutations"]): Budgets => ({
      ...budgets,
      grid: { ...budget, mutations: entry },
    })

    it("lets it stand with a reason and where it came from, old to new", () => {
      const next = raised({ budget: 30, reason: "A live readout per terminal", from: "#240" })
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
      expect(countersSummary(worse, rows, changes)).toContain(
        "| grid | mutations | 20 → 30 | A live readout per terminal | #240 |",
      )
    })

    it("refuses a bare number", () => {
      expect(budgetChanges(raised(30), budgets)[0]?.problem).toBeDefined()
    })

    it("refuses a raise that doesn't say where it came from", () => {
      expect(
        budgetChanges(raised({ budget: 30, reason: "A readout", from: " " }), budgets)[0]?.problem,
      ).toBeDefined()
    })
  })

  context("when a pull request lowers a budget", () => {
    it("shows it, needing no reason", () => {
      const changes = budgetChanges({ ...budgets, focus: { ...budget, bytes: 100 } }, budgets)
      expect(changes).toEqual([{ phase: "focus", counter: "bytes", from: 500, to: 100 }])
      expect(countersSummary(reading, checkCounters(reading, budgets), changes)).toContain(
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
})
