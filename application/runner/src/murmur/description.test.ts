import { describe, expect, it } from "../test.js"
import { parseDescription } from "./description.js"

const reply = (title: unknown) => JSON.stringify({ title })

const title = (text: string, source?: string) =>
  parseDescription(JSON.stringify({ title: text }), source)?.title

describe("reading the model's title", () => {
  it("keeps a title that fits", () => {
    expect(parseDescription(reply("Upload client retries"))).toEqual({
      title: "Upload client retries",
    })
  })

  it("tidies whitespace, markdown, quotes and a trailing full stop", () => {
    expect(parseDescription(reply('  "**Fix** the  build."  '))).toEqual({ title: "Fix the build" })
  })

  it.each([
    "OK button styling",
    "Okay dialog copy",
    "Yes/No prompt handling",
    "Hello world example",
    "Hi-DPI icon rendering",
    "Hey Siri integration",
    "Thanks page redesign",
    "Thank you email template",
    "Continue button fix",
    "Continue onboarding flow",
    "Go on-call schedule",
    "Try again button",
    "Keep going indicator",
    "How are you form",
    "Whats up endpoint",
    "Go ahead deploy",
    "Yesterday report export",
    "Okta SSO login",
  ])("keeps %s, which only begins like a chat phrase", (text) => {
    expect(title(text)).toBeDefined()
  })

  it.each([
    "Hi there",
    "Okay sounds good",
    "Continue please",
    "Try again",
    "Is the build green?",
    "Thanks a lot",
    "Thank you so much",
    "Hey how are you",
    "Okay thanks",
    "Try again later",
    "How is it going",
    "Cześć co tam",
    "Dzięki za pomoc",
    "Dziękuję bardzo",
    "你好",
    "ありがとうございます",
    "안녕하세요",
  ])("refuses %s, which is all chat or a question", (text) => {
    expect(title(text)).toBeUndefined()
  })

  it.each([
    "Rotating webhook keys",
    "Billing webhook keys",
    "Rotating billing webhook secrets",
    "Rotating billing webhook keys rollout",
    "Following nginx access log",
    "Following the nginx error log",
    "Awaria testów runnera",
    "Walidacja formularza",
    "Walidacja formularza logowania",
    "Following the access log",
    "Upload client retries",
    "Fixing C++ build",
    "Node.js upgrade",
    "Testy jednostkowe runnera",
    "Übersicht der Tests",
    "Ошибка тестов",
  ])("keeps %s, real work that shares words with an example", (text) => {
    expect(title(text)).toBeDefined()
    // With a digest that says the same words, there is no doubt it is the work.
    expect(title(text, `about ${text}`)).toBeDefined()
  })

  it("refuses an example copied, unless the digest is about the same work", () => {
    expect(title("Rotating billing webhook keys")).toBeUndefined()
    expect(title("Awaria testów")).toBeUndefined()
    expect(title("Rotating billing webhook keys", "fix the billing page")).toBeUndefined()
    // The source is folded like the title's words: accents don't hide it.
    expect(title("Awaria testów", "Naprawa: awaria TESTÓW w CI")).toBe("Awaria testów")
    expect(title("Rotating webhook keys", "fix the billing page")).toBeUndefined()
    expect(
      title("Rotating billing webhook keys", "please rotate: rotating billing webhook keys"),
    ).toBe("Rotating billing webhook keys")
  })

  it.each([
    ["認証フローの修正", true],
    ["修复登录页面", true],
    ["ログイン 画面 修正", true],
    ["修", false],
    ["修复登录页面和注册页面的所有问题以及更多", false],
    ["Naprawa logowania", true],
  ])("counts %s by its characters when it has no spaces: %s", (text, valid) => {
    expect(title(text) !== undefined).toBe(valid)
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

describe("refusing a title that looks like a secret", () => {
  it.each([
    "Fix PR 131",
    "Upgrade to Node 26",
    "Migrate v2 API",
    "Review EMO-104",
    "Bump React 19.2 types",
    "Internationalisation of checkout",
  ])("keeps %s", (text) => {
    expect(title(text)).toBe(text)
  })

  it.each([
    "Rotate ghp_A1b2C3d4E5f6G7h8 key",
    "Token Zq8rT2mWx9LpKd3VnB7s",
    "Using sk-proj-abc123DEF456",
    "Fix [redacted] login",
    "Set password: hunter2",
    "Deploy a1b2c3d4e5f6g7h8i9",
  ])("refuses %s", (text) => {
    expect(title(text)).toBeUndefined()
  })
})
