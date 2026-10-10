import { describe, expect, it } from "../test.js"
import { parseDescription } from "./description.js"

const reply = (title: unknown) => JSON.stringify({ title })

describe("reading the model's title", () => {
  it("keeps a title that fits", () => {
    expect(parseDescription(reply("Upload client retries"))).toEqual({
      title: "Upload client retries",
    })
  })

  it("tidies whitespace, markdown, quotes and a trailing full stop", () => {
    expect(parseDescription(reply('  "**Fix** the  build."  '))).toEqual({ title: "Fix the build" })
  })

  it("keeps titles that merely share a word with an example, or start like a chat phrase", () => {
    expect(parseDescription(reply("Billing invoice export"))?.title).toBe("Billing invoice export")
    expect(parseDescription(reply("Continuous integration setup"))?.title).toBe(
      "Continuous integration setup",
    )
  })

  it("ignores fields it didn't ask for", () => {
    expect(parseDescription(JSON.stringify({ title: "Fix the build", summary: "x" }))).toEqual({
      title: "Fix the build",
    })
  })

  it.each([
    ["a question", reply("Hows going?")],
    ["a question about the work", reply("What is the build status?")],
    ["a chat phrase", reply("Try again")],
    ["a greeting", reply("Hello there")],
    ["an example title", reply("Rotating billing webhook keys")],
    ["an example title in other case", reply("rotating Billing webhook KEYS.")],
    ["an example title but for a word", reply("Rotating billing webhook")],
    ["not JSON", "Sure! A title."],
    ["a non-object", "[1]"],
    ["no title", JSON.stringify({ summary: "Fix the build" })],
    ["a title that isn't text", reply(3)],
    ["a one-word title", reply("Build")],
    ["a seven-word title", reply("one two three four five six seven")],
    [
      "a title past 48 characters",
      reply("Internationalisation internationalisation internationalisation"),
    ],
    ["an empty title", reply("  ")],
  ])("rejects %s", (_name, raw) => {
    expect(parseDescription(raw)).toBeUndefined()
  })
})
