import { describe, expect, it } from "../test.js"
import { dictationHint, hintChars, hintTerms, type HintFacts } from "./hint.js"

const none: HintFacts = {
  project: null,
  cwd: "",
  branch: null,
  folders: [],
  files: [],
  plan: null,
  prompts: [],
  reply: null,
}

const facts = (some: Partial<HintFacts>): HintFacts => ({ ...none, ...some })

describe("the dictation hint", () => {
  it("names the project, its branch and folder, then what the work is about", () => {
    expect(
      dictationHint(
        {
          project: "Novadeck",
          cwd: "/home/me/novadeck/application/runner",
          branch: "task/whisper-hints",
          folders: ["/home/me/novadeck/application/runner/src/voice"],
          files: ["service.ts", "hint.ts"],
          plan: "Add richer dictation hints",
          prompts: ["make the hint use busiestFolders and Work.first"],
          reply: "I changed dictationPrompt in the UI.",
        },
        "en",
      ),
    ).toBe(
      "Working on Novadeck, on the whisper-hints branch, in the runner folder, with voice, " +
        "service.ts, hint.ts, busiestFolders, Work.first, dictationPrompt and UI. " +
        "Add richer dictation hints.",
    )
  })

  it("puts names likelier said first: folders, files, prompts, then the agent's reply", () => {
    const hint = dictationHint(
      facts({
        folders: ["/w/payments"],
        files: ["ledger.ts"],
        prompts: ["fix refundFlow"],
        reply: "Updated retryQueue",
      }),
      "en",
    )
    expect(hint).toBe("With payments, ledger.ts, refundFlow and retryQueue.")
  })

  it("lists each name once, whatever its case, the project and branch among them", () => {
    expect(
      dictationHint(
        facts({
          project: "Checkout",
          cwd: "/srv/checkout",
          branch: "feat/ledger",
          folders: ["/srv/checkout/ledger", "/srv/checkout/Ledger"],
          files: ["ledger.ts", "ledger.ts"],
          prompts: ["see ledger.ts and Checkout"],
        }),
        "en",
      ),
    ).toBe("Working on Checkout, on the ledger branch, with ledger.ts.")
  })

  it("leaves out commits, ids, numbers, addresses, long words and folders every project has", () => {
    expect(
      dictationHint(
        facts({
          project: "Api",
          cwd: "/home/me/api/src",
          branch: "3f9a2c1",
          folders: ["/home/me/api/src", "/home/me/api/node_modules/zod/lib", "/a/b/c/d/e/routes"],
          files: ["2026-10-10.log", "x"],
          prompts: [
            "deploy 9f86d081884c7d65 to me@example.com, id 123e4567-e89b-12d3-a456-426614174000 " +
              `${"a".repeat(40)}Name and see packages/billing/src/invoiceTotals.ts`,
          ],
        }),
        "en",
      ),
    ).toBe("Working on Api, with routes and invoiceTotals.ts.")
  })

  it("takes from prompts only names spelled as code, or capitalised mid-sentence", () => {
    expect(
      dictationHint(
        facts({
          prompts: [
            "Now ask Whisper to spell user_id, the VAD and utf8. Then stop",
            "Build the paging for the orders API and more and more th…",
          ],
        }),
        "en",
      ),
    ).toBe("With Whisper, user_id, VAD, utf8 and API.")
  })

  it("keeps to its caps on names and length, dropping the plan before any name", () => {
    const many = Array.from({ length: 40 }, (_, index) => `module${index}.ts`)
    const capped = dictationHint(facts({ project: "Big", files: many }), "en")
    expect(capped).toContain(`module${hintTerms - 1}.ts`)
    expect(capped).not.toContain(`module${hintTerms}.ts`)
    const long = Array.from({ length: 40 }, (_, index) => `averyverylongmodulename${index}.ts`)
    const plan = "Split the module loader into smaller pieces for a faster start"
    const hint = dictationHint(facts({ project: "Big", files: long, plan }), "en")
    expect(hint.length).toBeLessThanOrEqual(hintChars)
    expect(hint).toMatch(/^Working on Big, with averyverylongmodulename0\.ts, .* and \S+\.$/)
    expect(hint).not.toContain("Split")
  })

  it("is the plan's title as a sentence of its own, without a word cut off", () => {
    expect(dictationHint(facts({ project: "Shop", plan: "plan: move the cart to…" }), "en")).toBe(
      "Working on Shop. Plan: move the cart.",
    )
  })

  it("is nothing without anything to say, or only what there is", () => {
    expect(dictationHint(none, "en")).toBe("")
    expect(dictationHint(none, "pl")).toBe("")
    expect(dictationHint(facts({ project: " ", cwd: "/" }), "en")).toBe("")
    expect(dictationHint(facts({ cwd: "/srv/api" }), "en")).toBe("In the api folder.")
    expect(dictationHint(facts({ project: "Home", cwd: "/home/me/" }), "en")).toBe(
      "Working on Home, in the me folder.",
    )
    expect(dictationHint(facts({ project: "novadeck", cwd: "C:\\work\\novadeck\\" }), "en")).toBe(
      "Working on novadeck.",
    )
  })

  it("has no English words for any other language, or one the engine tells", () => {
    const some = facts({
      project: "Kasa",
      cwd: "/srv/kasa/faktury",
      branch: "fix/vat-rates",
      files: ["vatRates.ts"],
      plan: "Popraw stawki VAT w fakturach",
      prompts: ["popraw stawki w vatRates"],
    })
    expect(dictationHint(some, "pl")).toBe("Kasa, vat-rates, faktury: vatRates.ts, VAT.")
    expect(dictationHint(some, "auto")).toBe(dictationHint(some, "pl"))
    expect(dictationHint(facts({ project: "Kasa" }), "de")).toBe("Kasa.")
  })
})
