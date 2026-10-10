import { describe, expect, it } from "../test.js"
import { looksSecret, parseDescription } from "./description.js"

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
    "Set password: hunter2xyz99",
    "Deploy a1b2c3d4e5f6g7h8i9",
  ])("refuses %s", (text) => {
    expect(title(text)).toBeUndefined()
  })
})

describe("realistic titles with names, versions and numbers", () => {
  const titles = [
    "Bumping version to v2.3.1",
    "Releasing novadeck v0.9.0-beta.2",
    "Fixing EMO-104 login redirect",
    "Working on JIRA-1234 checkout",
    "Reviewing commit 9f86d08",
    "Rebasing onto 1b19df9",
    "Fixing useWorkspaceStore selector",
    "Testing integration.test.ts timing",
    "Publishing @novadeck/protocol package",
    "Upgrading to Node 26",
    "Computing sha256 checksums",
    "Adding OAuth2 login flow",
    "Decoding base64 payloads",
    "Building for x86_64 Linux",
    "Adding IPv6 support",
    "Deploying to k8s cluster",
    "Setting up i18n strings",
    "Debugging WebSocketProvider reconnects",
    "Refactoring createResetToken helper",
    "Running pytest on test_auth.py",
    "Fixing aarch64-apple-darwin build",
    "Building aarch64-unknown-linux-gnu target",
    "Pulling postgres:16-alpine image",
    "Upgrading python3.12 dependencies",
    "Configuring ubuntu-24.04 runner",
    "Migrating to React 19",
    "Tuning PostgreSQL 16 indexes",
    "Fixing CVE-2024-3094 exposure",
    "Reading RFC 9110 semantics",
    "Building ffmpeg with libx264",
    "Encoding H.264 video",
    "Testing utf-8 decoding",
    "Fixing ES2022 target errors",
    "Updating tsconfig.build.json paths",
    "Editing docker-compose.yml services",
    "Running cargo build --release",
    "Fixing serde_json deserialization",
    "Profiling useCallback re-renders",
    "Fixing MAX_RETRY_COUNT handling",
    "Bumping @types/node to 24.0.0",
    "Installing vitest@3.2.4",
    "Fixing TS2345 type errors",
    "Tracking issue #131 review",
    "Reviewing PR #131 redaction",
    "Adding Ed25519 key support",
    "Rotating TLS certificates",
    "Writing murmur bash tests",
    "Naprawa testów integracyjnych",
    "Poprawki w przeglądarce plików",
    "Wdrażanie wersji 2.3.1",
    "Migracja bazy PostgreSQL16",
    "修复登录问题",
    "重构数据库模块",
    "テストの修正",
    "ビルドエラー修正",
    "Fixing internationalization bugs",
    "Implementing authentication middleware",
    "Optimizing ResizeObserver callbacks",
    "Debugging ReactDOMServer hydration",
    "Configuring electron-builder notarization",
    "Adding getServerSideProps caching",
    "Investigating MutationObserver leaks",
    "Updating CHANGELOG for v1.0.0-rc.1",
    "Fixing useLayoutEffect warning",
    "Testing HTTP/2 multiplexing",
    "Benchmarking SQLite WAL mode",
    "Fixing Bearer token refresh",
    "Rotating API token secrets",
    "Fixing token: refresh bug",
    "Session secret rotation",
    "Password reset flow",
    "Debugging password: reset email",
    "Adding gpt-4o-mini fallback",
    "Calling claude-opus-4-1 model",
    "Using llama3.1-8b locally",
    "Testing stm32f407 firmware",
    "Building esp32-s3 firmware",
    "Fixing win32-x64 packaging",
    "Packaging darwin-arm64 build",
    "Fixing linux-x64-gnu binary",
    "Upgrading eslint-plugin-react-hooks",
    "Configuring @typescript-eslint/parser",
    "Fixing react-native-reanimated crash",
    "Reviewing feature/murmur-redaction branch",
    "Merging task/murmur into main",
    "Fixing src/terminals/murmur.ts",
    "Fixing Basic auth2 header",
    "修复登录页面在移动端的布局错误",
    "重构用户认证模块并补充单元测试",
    "修复v2版本登录问题",
    "データベース接続エラーの修正対応",
    "Naprawa konfiguracyjnego skryptu",
    "Poprawa zabezpieczeniowych reguł",
    "Datenbankverbindungsfehler beheben",
    "Fixing Kubernetes-deployment rollout",
    "Writing TypeScript declarations",
    "Debugging IntersectionObserver usage",
    "Fixing ServiceWorkerRegistration errors",
    "Refactoring useWorkspaceStore hook",
    "Updating README.md and CHANGELOG.md",
    "Running pnpm format:check lint",
    "Fixing pnpm-lock.yaml conflicts",
    "Editing application/runner/package.json",
  ]

  it("keeps every one", () => {
    expect(titles.filter((text) => title(text) === undefined)).toEqual([])
  })

  it.each([
    "Fixing ghp_A1b2C3d4E5f6G7h8I9j0 leak",
    "Rotate sk-proj-abc123DEF456ghi789 key",
    "Remove AKIAIOSFODNN7EXAMPLE from repo",
    "Paste Zq8rT2mWx9LpKd3VnB7sYcHt5GfAb4Cd6Ef",
    "Using glpat-xxXXxx1234567890abcd",
    "Token hf_AbCdEfGhIjKlMnOpQrStUvWx012345",
    "Set password: hunter2xyz99",
    "Debug xoxb-123456789012-abcdefghijkl",
    "Google ya29.a0AfH6SMBx-abcdefghijklmnop",
  ])("refuses %s", (text) => {
    expect(title(text)).toBeUndefined()
  })
})

describe("the guard on titles and the words in them", () => {
  const legit = [
    "Bumping version to v2.3.1",
    "Releasing novadeck v0.9.0-beta.2",
    "Fixing EMO-104 login redirect",
    "Working on JIRA-1234 checkout",
    "Reviewing commit 9f86d08",
    "Rebasing onto 1b19df9",
    "Fixing useWorkspaceStore selector",
    "Testing integration.test.ts timing",
    "Publishing @novadeck/protocol package",
    "Upgrading to Node 26",
    "Computing sha256 checksums",
    "Adding OAuth2 login flow",
    "Decoding base64 payloads",
    "Building for x86_64 Linux",
    "Adding IPv6 support",
    "Deploying to k8s cluster",
    "Setting up i18n strings",
    "Debugging WebSocketProvider reconnects",
    "Refactoring createResetToken helper",
    "Running pytest on test_auth.py",
    "Fixing aarch64-apple-darwin build",
    "Building aarch64-unknown-linux-gnu target",
    "Pulling postgres:16-alpine image",
    "Upgrading python3.12 dependencies",
    "Configuring ubuntu-24.04 runner",
    "Migrating to React 19",
    "Tuning PostgreSQL 16 indexes",
    "Fixing CVE-2024-3094 exposure",
    "Reading RFC 9110 semantics",
    "Building ffmpeg with libx264",
    "Encoding H.264 video",
    "Testing utf-8 decoding",
    "Fixing ES2022 target errors",
    "Updating tsconfig.build.json paths",
    "Editing docker-compose.yml services",
    "Running cargo build --release",
    "Fixing serde_json deserialization",
    "Profiling useCallback re-renders",
    "Fixing MAX_RETRY_COUNT handling",
    "Bumping @types/node to 24.0.0",
    "Installing vitest@3.2.4",
    "Fixing TS2345 type errors",
    "Tracking issue #131 review",
    "Adding Ed25519 key support",
    "Rotating TLS certificates",
    "Writing murmur bash tests",
    "Naprawa testów integracyjnych",
    "Poprawki w przeglądarce plików",
    "Wdrażanie wersji 2.3.1",
    "Migracja bazy PostgreSQL16",
    "修复登录问题",
    "重构数据库模块",
    "テストの修正",
    "ビルドエラー修正",
    "Fixing internationalization bugs",
    "Implementing authentication middleware",
    "Optimizing ResizeObserver callbacks",
    "Debugging ReactDOMServer hydration",
    "Configuring electron-builder notarization",
    "Adding getServerSideProps caching",
    "Investigating MutationObserver leaks",
    "Updating CHANGELOG for v1.0.0-rc.1",
    "Fixing useLayoutEffect warning",
    "Testing HTTP/2 multiplexing",
    "Benchmarking SQLite WAL mode",
    "Fixing Bearer token refresh",
    "Rotating API token secrets",
    "Fixing token: refresh bug",
    "Session secret rotation",
    "Password reset flow",
    "Debugging password: reset email",
    "Adding gpt-4o-mini fallback",
    "Calling claude-opus-4-1 model",
    "Using llama3.1-8b locally",
    "Testing stm32f407 firmware",
    "Building esp32-s3 firmware",
    "Fixing win32-x64 packaging",
    "Packaging darwin-arm64 build",
    "Fixing linux-x64-gnu binary",
    "Upgrading eslint-plugin-react-hooks",
    "Configuring @typescript-eslint/parser",
    "Fixing react-native-reanimated crash",
    "Merging task/murmur into main",
    "Fixing src/terminals/murmur.ts",
    "Fixing Basic auth2 header",
    "  -",
    "ALSO-PREV",
    "guard-only refusals",
    "修复数据库连接池超时问题并添加重试",
    "修复登录页面在移动端的布局错误",
    "重构用户认证模块并补充单元测试",
    "升级到React19并修复类型错误",
    "修复v2版本登录问题",
    "データベース接続エラーの修正対応",
    "ログイン画面のレイアウト崩れを修正",
    "사용자인증모듈리팩토링및테스트추가",
    "Naprawa konfiguracyjnego skryptu",
    "Poprawa zabezpieczeniowych reguł",
    "Datenbankverbindungsfehler beheben",
    "Fixing Kubernetes-deployment rollout",
    "Writing TypeScript declarations",
    "Debugging IntersectionObserver usage",
    "Fixing ServiceWorkerRegistration errors",
    "Refactoring useWorkspaceStore hook",
    "Updating README.md and CHANGELOG.md",
    "Running pnpm format:check lint",
    "Fixing pnpm-lock.yaml conflicts",
    "Editing application/runner/package.json",
    "internationalization",
    "responsibilities",
    "troubleshooting",
    "implementations",
    "authentication",
    "synchronization",
    "synchronizowania",
    "konfiguracyjnego",
    "konfiguracyjnych",
    "uwierzytelniania",
    "uwierzytelnienia",
    "zabezpieczeniowych",
    "przeprogramowania",
    "niezawodnościowych",
    "współbieżnościowy",
    "bezpieczeństwa",
    "Datenbankverbindungsfehler",
    "Benutzerverwaltung",
    "Zugriffsberechtigungen",
    "Abhängigkeitsauflösung",
    "incompatibilities",
    "misconfiguration",
    "misconfigurations",
    "reproducibility",
    "characterization",
    "straightforward",
    "WebSocketProvider",
    "MutationObserver",
    "ResizeObserver",
    "useLayoutEffect",
    "createResetToken",
    "getServerSideProps",
    "ServiceWorkerRegistration",
    "IntersectionObserver",
    "DocumentFragment",
    "HTMLCanvasElement",
    "XMLHttpRequest",
    "AbortController",
    "TypeScript-compiler",
    "electron-builder",
    "docker-compose.yml",
    "tsconfig.build.json",
    "vite.config.ts",
    "package-lock.json",
    "@novadeck/protocol",
    "@novadeck/runner",
    "@tanstack/react-query",
    "react-router-dom",
    "prettier-plugin-tailwindcss",
  ]

  it("passes every legitimate title and word", () => {
    expect(legit.filter((text) => looksSecret(text))).toEqual([])
  })

  it.each([
    "Using Zq8rT2mWx9Lp now",
    "Using a1b2c3d4e5f6g7h8 now",
    "Using ABCDEF123456 now",
    "Using abcdefghijklmnop1234 now",
    "Fix 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    "Fix 1b19df98cc13089e7bd5f741397680787156d32e",
    "Using sk_live_51HxYzAbCdEf now",
    "Using rk_live_51HxYzAbCdEf now",
    "Using SG.abcdefghijklmnopqrstuv now",
    "Using AGE-SECRET-KEY-1QYQSZQGPQYQ now",
  ])("refuses a random-looking piece or a hash in %s", (text) => {
    expect(looksSecret(text)).toBe(true)
  })

  it(
    "keeps titles with astral letters, emoji and extension B ideographs, and does not hang",
    { timeout: 5000 },
    () => {
      for (const text of ["Solving 𝐱: system", "修复𠀀登录问题", "😀 Fix login 😀", "Fix 𝐀=b"])
        expect(title(text)).toBe(text)
    },
  )
})
