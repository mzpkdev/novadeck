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
  const previous = { title: "Deploying app" }

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
      summary: "rotated sk-abcdefghijklmnopqrstuvwxyz",
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

// [what the terminal showed, the secret in it that must go]
const leaks: [string, string][] = [
  ["AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "wJalrXUtnFEMI"],
  ["DATABASE_URL=postgres://app:Sup3rS3cret@db.internal:5432/app", "Sup3rS3cret"],
  ["REDIS_URL=redis://:p4ssw0rdXYZ@cache:6379/0", "p4ssw0rdXYZ"],
  ["mongodb+srv://admin:hunter2@cluster0.mongodb.net/test", "hunter2"],
  ["npm_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789", "aBcDeFgHiJkLmNoPq"],
  ["//registry.npmjs.org/:_authToken=0f3a1b2c-1111-2222-3333-444455556666", "0f3a1b2c"],
  ["password = pypi-AgEIcHlwaS5vcmcCJGE0ZjYx", "AgEIcHlwaS5v"],
  ["Authorization: token ghx0123456789abcdefABCDEF", "ghx0123456789"],
  ["x-api-key: 3f9a8b7c6d5e4f3a2b1c", "3f9a8b7c6d5e"],
  ["curl -H 'X-Api-Key: Zx9Qp2Lm7Rt4Vb8Nc1' https://api.example.com", "Zx9Qp2Lm7Rt4"],
  ["curl -u admin:hunter2 https://api.example.com", "hunter2"],
  ["ANTHROPIC_API_KEY: sk-ant-api03-short", "api03-short"],
  ["  password: hunter2", "hunter2"],
  ['    password: "hunter2"', "hunter2"],
  ["client_secret: abcDEF123ghiJKL", "abcDEF123ghiJKL"],
  ["  DB_PASS: hunter2-long-password", "hunter2-long"],
  ["sk_live_51HxYzAbCdEfGhIjKlMnOpQr", "51HxYzAbCd"],
  ["rk_live_51HxYzAbCdEfGhIjKlMnOpQr", "51HxYzAbCd"],
  ["STRIPE_SECRET_KEY=sk_live_51HxYzAbCdEfGhIjKlMnOpQr", "51HxYzAbCd"],
  ["stripe listen --api-key sk_live_51HxYzAbCdEfGhIjKlMnOpQr", "51HxYzAbCd"],
  ["AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY", "9tSrke72"],
  ["glpat-xxXXxx1234567890abcd", "xxXXxx12345"],
  ["hf_AbCdEfGhIjKlMnOpQrStUvWxYz012345", "AbCdEfGhIjKl"],
  ["https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX", "XXXXXXXXXXXX"],
  [
    "https://discord.com/api/webhooks/123456789012345678/abcDEFghiJKLmnoPQRstuVWXyz-0123456789_abc",
    "abcDEFghiJKL",
  ],
  ["https://example.com/cb?access_token=abc123XYZ&state=1", "abc123XYZ"],
  ["https://bucket.s3.amazonaws.com/f?X-Amz-Signature=abcd1234ef567890", "abcd1234ef567890"],
  ["MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7", "MIIEvQIBADAN"],
  ["export OPENAI_API_KEY = sk-xx", "sk-xx"],
  ["+ export GITHUB_TOKEN=gho_16C7e42F292c6912E7710c838347Ae178B4a", "16C7e42F"],
  ["PGPASSWORD=hunter2 psql", "hunter2"],
  ["MYSQL_PWD=hunter2 mysql", "hunter2"],
  ["ADMIN_PWD=hunter2", "hunter2"],
  ["DB_PASS=hunter2", "hunter2"],
  ["docker login -p hunter2 registry", "hunter2"],
  ["mysql -uroot -phunter2", "hunter2"],
  ['SECRET_KEY_BASE="a b" # comment', '"a b"'],
  ['{"apiKey": 12345678}', "12345678"],
  ["apiKey=Zx9Qp2Lm7Rt4", "Zx9Qp2Lm7Rt4"],
  ['{"clientSecret":"Zx9Qp2Lm7Rt4"}', "Zx9Qp2Lm7Rt4"],
  ["AccountName=acct;AccountKey=Zx9Qp2Lm7Rt4Vb8Nc1==;EndpointSuffix=core", "Zx9Qp2Lm7Rt4"],
  ["Server=db;User Id=sa;Password=hunter2;", "hunter2"],
  ["jdbc:postgresql://db:5432/app?user=app&password=hunter2", "hunter2"],
  ["MY_SECRETVALUE=hunter2", "hunter2"],
  ["Password: hunter2", "hunter2"],
  ['"private_key_id": "1a2b3c4d5e6f"', "1a2b3c4d5e6f"],
  ["ghp_abc123", "abc123"],
  ["set -x OPENAI_API_KEY sk-short", "sk-short"],
  ['$env:OPENAI_API_KEY = "sk-short"', "sk-short"],
  ["Authorization: Basic YWRtaW46aHVudGVyMg==", "YWRtaW46"],
  ["Authorization: Bearer abc123", "abc123"],
  ["Cookie: session=abcDEF123456; csrftoken=XyZ", "abcDEF123456"],
  ["Set-Cookie: sid=abcDEF123456789; Path=/", "abcDEF123456789"],
  ["https://user:p@ss@host/", "p@ss"],
  ["https://ghp_abc123@github.com/x/y.git", "abc123"],
  ["https://x-access-token:ghs_abc123@github.com/x/y", "abc123"],
  ["sk-abcdefghij", "abcdefghij"],
  ["AGE-SECRET-KEY-1QYQSZQGPQYQSZQGPQYQSZQGPQYQSZQGPQYQSZQGPQYQSZQGPQYQSZQ", "QYQSZQGPQYQ"],
  ["hvs.CAESIJlU9JMYEhOPYv4igdhm9PnZDrabYdobQ4Ymnlq1qY-vGh4KHGh2cy5oV", "CAESIJlU9JMY"],
  ["aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "wJalrXUtnFEMI"],
  ["Bearer abc123", "abc123"],
]

// Text that mentions a secret's name or looks like one, and must reach the model whole.
const kept = [
  "integrity sha512-abc",
  "image@sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "commit 69231a3",
  "commit 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "id 550e8400-e29b-41d4-a716-446655440000",
  "MAX_KEYS=3 KEY_COUNT=10 PRIMARY_KEY=id",
  "const key = cache.get(id)",
  "--sort-key name",
  "auth=required authority=root",
  "token_count=1200 tokenizer=bpe max_tokens=300",
  "sessionId=42",
  "/home/user/projects/novadeck/application/runner/src/murmur/ServiceTest123Abc",
  "useWorkspaceTerminalSelectionStateManager2Hook",
  "AbstractSingletonProxyFactoryBeanConfigurer2Impl",
  "SomeVeryLongTestNameThatDescribesBehaviour1AndMore",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk",
  "d41d8cd98f00b204e9800998ecf8427e  file.txt",
  "https://github.com/acme/app/tree/feature/AbcDefGhiJklMnoPqrStuVwx1234567890",
  "--keymap us --key-file ./id.pem",
  "pnpm --filter @novadeck/runner test -- --token-budget 300",
  "kubectl get secret my-secret -o yaml",
  "--auth-type oauth",
  '{"auth": "none", "author": "ada"}',
  "keys = d.keys()",
  "authButton=primary",
  "cat /etc/passwd",
  "ada@mac ~/Projects/Novadeck2/application/runner/src/murmur % pnpm test",
  "cd /Users/Ada/Projects/Shop2024/services/checkout",
  "C:\\Users\\Ada\\Projects\\Shop2024\\services\\checkout> npm test",
  "Wrote src/components/DashboardOverviewPanel2/index.tsx",
  "import { WorkspaceTerminalSelectionState2 } from './state'",
  "FAIL src/murmur/service.test.ts > Murmur > describes2Terminals_whenTheGpuIsReady",
  "PWD=/home/ada/project",
]

describe("redacting what terminals show", () => {
  it.each(leaks)("removes the secret in %s", (text, secret) => {
    const result = redact(text)
    expect(result).not.toContain(secret)
    expect(result).toContain(redacted)
  })

  it.each(kept)("keeps %s", (text) => {
    expect(redact(text)).toBe(text)
  })
})

describe("redacting a screen's rows", () => {
  // The terminal side joins a soft-wrapped line before redaction, so a secret is on one row.
  const secrets = [
    "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a09",
    "STRIPE_SECRET_KEY=sk_live_51HxYzAbCdEfGhIjKlMnOpQrStUvWxYz",
    "GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD",
    "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-abcdefgh",
    "dGhpcyBpcyBhIHNlY3JldCBrZXkgZm9yIHRlc3RpbmcgMTIzNDU2Nw1X",
    "postgres://app:Sup3rS3cretPassword@db.internal:5432/app",
    "ya29.a0AfH6SMBx-abcdefghijklmnopqrstuvwxyz0123456789",
  ]

  it.each(secrets)("removes %s from its row, leaving the rows around it", (secret) => {
    const result = redact(`before\n${secret}\n$ ls -la`)

    expect(result).not.toMatch(/9f86d0|sk_live_51|ghp_abc|AbCdEfGh|dGhpcyBp|Sup3rS3|a0AfH6/)
    expect(result.startsWith("before\n")).toBe(true)
    expect(result.endsWith("\n$ ls -la")).toBe(true)
  })

  it("does not carry a run on into the next row", () => {
    const text = [
      "commit 69231a3e0f1d2c3b4a5968778695a4b3c2d1e0f9",
      "Author: Ada <ada@example.com>",
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822c\nuser@host",
      "Digest: sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "Status: Downloaded newer image",
    ].join("\n")

    const result = redact(text)

    expect(result).toContain("Author: Ada <ada@example.com>")
    expect(result).toContain("user@host")
    expect(result).toContain("Status: Downloaded newer image")
    expect(result.split("\n")[0]).toBe(text.split("\n")[0])
    expect(result).toContain(
      "Digest: sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    )
  })

  it("keeps the rows of ordinary text apart", () => {
    const text = "commit 69231a3e0f1d2c3b4a5968778695a4b3c2d1e0f9\non task/murmur\ndone"
    expect(redact(text)).toBe(text)
  })

  it("removes Polish password names and Google access tokens", () => {
    expect(redact("hasło: tajne123")).toBe(`hasło: ${redacted}`)
    expect(redact("haslo=tajne123")).toBe(`haslo=${redacted}`)
    expect(redact("ya29.a0AfH6SMBx-abcdefghijklmnop")).toBe(redacted)
  })

  it("leaves a short bare base64 string alone", () => {
    expect(redact("dGhpcyBpcyBhIHNlY3JldA==")).toBe("dGhpcyBpcyBhIHNlY3JldA==")
  })
})

describe("redacting what a delta review found", () => {
  const gone: [string, string][] = [
    ["$ openssl rand -base64 32\nK7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols=", "K7gNU3sdo"],
    ["AWS Secret Access Key [None]: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "wJalrXUtnFEMI"],
    ["$ cat key.txt\nwJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "wJalrXUtnFEMI"],
    ["redis-cli -a S3cr3tP4ss", "S3cr3tP4ss"],
    ["redis-cli -a mypassword123 ping", "mypassword123"],
    ["_auth=dXNlcjpwYXNzd29yZA==", "dXNlcjpwYXNz"],
    ["export npm_config__auth=dXNlcjpwYXNz", "dXNlcjpwYXNz"],
    [
      "SG.abcdefghijklmnopqrstuv.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP",
      "abcdefghijklmnopqrstuv",
    ],
    ["SENTRY_DSN=https://abc123def456@o123.ingest.sentry.io/456", "abc123def456"],
    ["https://0123456789abcdef0123456789abcdef@o1.ingest.sentry.io/5", "0123456789abcdef"],
    ["export AUTH=Basic dXNlcjpwYXNz", "dXNlcjpwYXNz"],
    ["htpasswd -b .htpasswd admin hunter2", "hunter2"],
    ["openssl enc -k mypassword", "mypassword"],
    ["openssl enc -aes-256-cbc -pass pass:hunter2 -in a", "hunter2"],
    [
      "export DISCORD_BOT=MTE1ODk2NjEwNzA2NjEwNzA2Ng.GhJk12.abcdefghijklmnopqrstuvwxyzABCD",
      "GhJk12",
    ],
  ]
  it.each(gone)("removes the secret in %s", (text, secret) => {
    const result = redact(text)
    expect(result).not.toContain(secret)
    expect(result).toContain(redacted)
  })

  const unchanged = [
    "Server running at http://127.0.0.1:5173\n@novadeck/ui:dev: ready in 300ms",
    "listening on http://localhost:3000\n@scope/pkg@1.2.3 build",
    "ssh://git@github.com:mzpk/novadeck.git",
    "git@github.com:mzpk/novadeck.git",
    "password: z.string().min(8)",
    "password = getpass()",
    "token=os.environ['TOKEN']",
    "SECRET_KEY = os.environ.get('SECRET_KEY')",
    "apiKey: process.env.API_KEY,",
    "const password = req.body.password",
    "secret: ${{ secrets.GITHUB_TOKEN }}",
    "  --token <TOKEN>  the token",
    "export TOKEN=$VAR",
    "export TOKEN=${VAR}",
    "integrity sha512-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfGhIjKlMnOpQrStUvWxYz0123456789==",
    "warn: integrity sha512-K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols=",
    "integrity sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8w",
    "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2",
    "https://github.com/mzpk/novadeck/pull/131/files#diff-abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    "/home/mzpk/Workspace/novadeck/tasks/murmur/novadeck/application/runner/src/terminals/manager.ts",
    "~/Projects/Novadeck2/application/runner/src/murmur",
    "services/checkout/ServiceTest123AbcDef456Ghi789Jkl",
    "SSH_AUTH_SOCK=/run/user/1000/ssh-agent.socket",
    "auth=required",
    "Basic auth enabled for user admin",
    "Bearer token required",
  ]
  it.each(unchanged)("keeps %s", (text) => {
    expect(redact(text)).toBe(text)
  })
})
