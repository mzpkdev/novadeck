import { describe, expect, it } from "../test.js"
import { parseDescription } from "./description.js"

const reply = (title: string, summary: string) => JSON.stringify({ title, summary })

describe("reading the model's description", () => {
  it("keeps a title and summary that fit", () => {
    expect(parseDescription(reply("Upload client retries", "Adding retries. Waiting."))).toEqual({
      title: "Upload client retries",
      summary: "Adding retries. Waiting.",
    })
  })

  it("tidies whitespace, markdown, quotes and a trailing full stop", () => {
    expect(parseDescription(reply('  "**Fix** the  build."  ', " Fixing\nthe build. "))).toEqual({
      title: "Fix the build",
      summary: "Fixing the build.",
    })
  })

  it("keeps the first two sentences of a longer summary", () => {
    expect(parseDescription(reply("Fix the build", "One. Two! Three? Four."))?.summary).toBe(
      "One. Two!",
    )
  })

  it("does not split a summary at a dot inside a word", () => {
    expect(
      parseDescription(reply("Fix the build", "Running vite 1.2 and v0.4.2 now."))?.summary,
    ).toBe("Running vite 1.2 and v0.4.2 now.")
  })

  it.each([
    ["not JSON", "Sure! A title."],
    ["a non-object", "[1]"],
    ["missing fields", JSON.stringify({ title: "Fix the build" })],
    ["wrong types", JSON.stringify({ title: 3, summary: "x" })],
    ["a one-word title", reply("Build", "Fixing.")],
    ["a seven-word title", reply("one two three four five six seven", "Fixing.")],
    [
      "a title past 48 characters",
      reply("Internationalisation internationalisation internationalisation", "x"),
    ],
    ["an empty summary", reply("Fix the build", "  ")],
    ["a first sentence past 200 characters", reply("Fix the build", `${"word ".repeat(50)}.`)],
  ])("rejects %s", (_name, raw) => {
    expect(parseDescription(raw)).toBeUndefined()
  })
})
