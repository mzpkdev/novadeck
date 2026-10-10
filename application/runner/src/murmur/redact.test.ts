import { describe, expect, it } from "../test.js"
import type { AgentDigest, ShellDigest } from "./describer.js"
import { redact, redactDigest, redacted } from "./redact.js"

describe("redacting secrets", () => {
  it.each([
    ["an OpenAI key", "export it as sk-proj-abcdefghijklmnopqrstuvwx now"],
    ["an Anthropic key", "key sk-ant-api03-AbCdEfGhIjKlMnOpQrSt-uvwxyz0123"],
    ["a GitHub token", "token ghp_abcdefghijklmnopqrstuvwxyz0123456789"],
    ["a fine-grained GitHub token", "github_pat_11ABCDEFG0abcdefghijklmnop_qrstuvwxyz"],
    ["an AWS key id", "id AKIAIOSFODNN7EXAMPLE here"],
    ["a Slack token", "xoxb-123456789012-abcdefghijkl"],
    ["a JWT", "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r"],
    ["a bearer header", "Authorization: Bearer abcDEF1234567890abcdef"],
    ["a long hex run", "digest 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"],
    ["a base64 run", "blob dGhpcyBpcyBhIHNlY3JldCBrZXkgZm9yIHRlc3RpbmcgMTIzNDU2Nw1X"],
  ])("removes %s", (_name, text) => {
    const result = redact(text)
    expect(result).toContain(redacted)
    expect(result.length).toBeLessThan(text.length + redacted.length)
  })

  it("removes the value of a secret-looking assignment and keeps the name", () => {
    expect(redact("API_KEY=hunter2 pnpm dev")).toBe(`API_KEY=${redacted} pnpm dev`)
    expect(redact('export DB_PASSWORD="my pass word"')).toBe(`export DB_PASSWORD=${redacted}`)
    expect(redact("GITHUB_TOKEN='abc'")).toBe(`GITHUB_TOKEN=${redacted}`)
    expect(redact("client_secret=abc&x=1")).toBe(`client_secret=${redacted}&x=1`)
  })

  it("removes the value of a secret-looking key in JSON", () => {
    expect(redact('{"password": "p4ss", "user": "ada"}')).toBe(
      `{"password": "${redacted}", "user": "ada"}`,
    )
  })

  it("removes the value that follows a secret-looking flag", () => {
    expect(redact("cli login --password hunter2 --verbose")).toBe(
      `cli login --password ${redacted} --verbose`,
    )
    expect(redact("cli --api-key=abc")).toBe(`cli --api-key=${redacted}`)
  })

  it("removes a URL's credentials and keeps the rest", () => {
    expect(redact("git clone https://ada:s3cret@github.com/acme/app.git")).toBe(
      `git clone https://${redacted}@github.com/acme/app.git`,
    )
    expect(redact("postgres://user:pw@db:5432/app")).toBe(`postgres://${redacted}@db:5432/app`)
  })

  it("removes a key block, even when its end isn't there", () => {
    const block =
      "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaA\n-----END OPENSSH PRIVATE KEY-----"
    expect(redact(`before\n${block}\nafter`)).toBe(`before\n${redacted}\nafter`)
    expect(redact("-----BEGIN RSA PRIVATE KEY-----\nMIIEow")).toBe(redacted)
  })

  it("leaves ordinary text alone", () => {
    const text = [
      "pnpm vitest --watch src/murmur/service.test.ts",
      "commit 69231a3e0f1d2c3b4a5968778695a4b3c2d1e0f9 on task/murmur",
      "max_tokens=300 author=ada keyboard=us",
      "application/runner/src/murmur/describer.ts and application/protocol/src/schemas.ts",
      "viridian-finale-implementation-and-the-shared-league",
      "https://github.com/mzpkdev/novadeck/pull/133",
      "Tests: 58 passed (59)",
    ].join("\n")
    expect(redact(text)).toBe(text)
  })
})

describe("redacting a digest", () => {
  const previous = {
    title: "Deploying app",
    summary: "Using token ghp_abcdefghijklmnopqrstuvwxyz0123456789.",
  }

  it("cleans every string of an agent digest", () => {
    const digest: AgentDigest = {
      kind: "agent",
      harness: "Claude Code",
      project: "app",
      folder: "api",
      branch: "task/API_KEY=abc",
      plan: "Rotate sk-abcdefghijklmnopqrstuvwxyz",
      folders: ["src"],
      prompts: ["use DB_PASSWORD=pw please", "now deploy"],
      reply: "done with https://u:p@host/",
      previous,
    }
    const clean = redactDigest(digest) as AgentDigest
    expect(JSON.stringify(clean)).not.toMatch(/ghp_|sk-abc|=pw|=abc|u:p@/)
    expect(clean.prompts[1]).toBe("now deploy")
    expect(clean.previous?.title).toBe("Deploying app")
  })

  it("sees a key block that spans the rows of a screen", () => {
    const digest: ShellDigest = {
      kind: "shell",
      project: null,
      folder: null,
      command: "cat id_rsa",
      screen: [
        "-----BEGIN PRIVATE KEY-----",
        "MIIEvQIBADANBgkqhkiG9w0B",
        "-----END PRIVATE KEY-----",
        "$",
      ],
      previous: null,
    }
    const clean = redactDigest(digest) as ShellDigest
    expect(clean.screen).toEqual([redacted, "$"])
  })
})
