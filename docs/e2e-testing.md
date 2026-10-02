# End-to-end tests

The end-to-end suite runs the real Claude Code, Codex and Antigravity TUIs in
NovaDeck's terminals, with NovaDeck's real plugin, hooks and MCP server, against a
scripted fake model. It checks agent messaging the way people use it, with real
harnesses: an agent calls `send`, NovaDeck rings the idle recipient, and the reply comes
back. The model is the one part replaced, so runs need no credentials, cost nothing and
give the same result every time.

## Running

```sh
npm run test:e2e                  # from the repository root
pnpm --filter @novadeck/runner test:e2e
pnpm --filter @novadeck/runner test:e2e src/e2e/claude.e2e.ts
```

The first run installs the pinned harnesses (a few hundred MB). Later runs reuse them.
`npm run test` never runs the suite: its files end in `.e2e.ts`, and only
`application/runner/vitest.e2e.config.ts` includes them. The unit tests for its parts
(`src/e2e/**/*.test.ts`) run with the rest.

| Variable                      | Effect                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `NOVADECK_E2E_CACHE`          | Where harnesses are installed. Defaults to `$XDG_CACHE_HOME/novadeck/e2e`, or `~/.cache/novadeck/e2e` without XDG_CACHE_HOME |
| `NOVADECK_E2E_HARNESS=latest` | Installs and runs each harness's newest npm release instead of its pin, as a drift check                                     |

## What is pinned

`application/runner/src/e2e/harnesses.json` pins each harness's release:

| Harness     | Published as                                          | Version |
| ----------- | ----------------------------------------------------- | ------- |
| Claude Code | npm, `@anthropic-ai/claude-code`                      | 2.1.287 |
| Codex       | npm, `@openai/codex`                                  | 0.159.3 |
| Antigravity | an archive, by its address and SHA-512 (Linux x86-64) | 1.2.14  |

`install.ts` installs each harness into `<cache>/<harness>-<version>`, staging it first
so an interrupted install never counts as done, and returns the folder holding its
program. npm runs with a home inside the cache, so neither npm nor a package's install
script reads or writes the developer's. Antigravity isn't on npm: its archive is
downloaded from the address its own installer's manifest gives, checked against the
pinned SHA-512 before anything of it runs, and only its program is kept, as `agy`. With
`NOVADECK_E2E_HARNESS=latest` it reads that manifest for the newest release instead. A
copy of a harness installed anywhere else on the machine is never used. To move a pin,
change it and run the suite.

## Isolation

The suite never runs a harness against the developer's configuration, login or
network:

- **A sandbox per test.** `sandbox.ts` makes a throwaway root under the system's
  temporary folder, with a home, a project, XDG folders and a private `XDG_RUNTIME_DIR`.
  Every process the test starts gets only the sandbox's environment, with nothing copied
  from the developer's. Its PATH is the pinned harnesses, a folder holding just `node`,
  and `/usr/bin:/bin`. The deck gives the runner's terminals the sandbox's environment
  as their `baseEnv`, so they don't start from the runner's own as they do in the app.
- **No keyring.** `DBUS_SESSION_BUS_ADDRESS` points at a socket that doesn't exist, so
  no harness finds a login in the secret service.
- **No network.** The fake model is also every process's `HTTP(S)_PROXY`. It refuses
  each tunnel and each request for another server and records its host, never its path.
  Only loopback is exempt.
- **No real credential.** Each harness gets a fake key that the fake model accepts. A
  request carrying any other credential is refused and counted, and its value is never
  stored. That fails the test, as does any request that tried a harness's real API
  host.
- **No updates.** Update checks are switched off, and npm's prefix points into the
  sandbox, so a harness that updates itself can't touch a global install.
- **A tripwire.** Before each test, the fixture notes the time and size of the entries
  in the developer's `~/.claude`, `~/.claude.json`, `~/.codex` and `~/.gemini`, and checks
  them again afterwards. It also looks for a Claude Code project named after the
  sandbox. Entries that the developer's own running agents change constantly
  (histories, sessions, logs, caches, databases, `~/.claude.json`) are left out, so the
  wire watches settings, plugins' configuration and logins. A machine without those
  folders, such as CI, has nothing to check.
- **Enter only on text seen to land.** A deck terminal's `submit` types the text, waits
  until the screen shows it, and only then presses Enter. `press` refuses Enter
  outright, so a test can't confirm a dialog or pick from a menu.

## Writing a scenario

```ts
import { claude } from "./agents/claude.js"
import { describe, e2e, expect } from "./fixture.js"
import { asked, latest, tool } from "./model/script.js"

const it = e2e(claude)

describe("Claude Code", () => {
  it("answers a prompt", async ({ e2e: { deck, model } }) => {
    model.use((call) => (asked(call, "Say hi") ? { text: "Hi." } : undefined))
    const t1 = await deck.open("claude")
    await t1.delivery(["ready"], 60_000)

    await t1.submit("Say hi")

    await t1.until("Hi.")
    await t1.delivery(["settled"])
  })
})
```

- `e2e(...setups)` gives each test a fake model, a sandbox and a deck, with each
  setup's harness installed, seeded and connected to NovaDeck through its own plugin
  commands.
- The fake model answers each call with the first rule that replies. `model.use` adds
  rules ahead of the earlier ones, and with none it answers "OK.". A `Call` is the same
  shape for every API. Its latest user turn includes whatever a hook added beside the
  prompt, such as a delivery of `<novadeck-messages>`. `side` marks a call the harness
  makes for itself, such as a title.
- A rule that answers with a tool call checks `asked(call, text)`. Otherwise the call
  after the tool's result would call it again. `tool(call, "send")` gives the name the
  harness uses for NovaDeck's `send` tool.
- Prefer asserting on what the model received (`model.waitFor`) and on NovaDeck's state
  (`summary()`, `messages()`, `delivery()`) over reading the screen.

## Adding a harness

1. Pin it in `harnesses.json` and make sure `installHarness` can install it.
2. Write its API's dialect in `src/e2e/model/`: it parses requests into `Call`s and
   encodes `Reply`s the way the harness reads them. It also answers the side endpoints
   the harness calls on the way to its prompt. To find those, run the harness against the
   fake model and read `model.strays`.
3. Write its `AgentSetup` in `src/e2e/agents/`. `prepare` seeds its configuration in
   the sandbox so it starts at its own prompt with no screen in between, and returns
   the environment that points it at the fake model with the fake credential. `hosts`
   lists its real API hosts. `connected`, when given, runs once NovaDeck's plugin is
   connected and before any harness starts, for setup only the plugin's files make
   possible.
4. Add `<harness>.e2e.ts` with its smoke scenarios.

## Claude Code against the fake model

- **Seeding.** Its config folder is `<sandbox home>/.claude`, set as `CLAUDE_CONFIG_DIR`.
  Its `.claude.json` there marks onboarding done, picks a theme, records the version's
  release notes as seen, turns auto-updates off, approves the fake key (by its last 20
  characters), and trusts the project. `settings.json` allows NovaDeck's MCP tools
  (`mcp__plugin_novadeck_novadeck`).
- **Environment.** `ANTHROPIC_BASE_URL` points at the fake model and
  `ANTHROPIC_API_KEY` holds the fake credential. Also set: `DISABLE_AUTOUPDATER`,
  `DISABLE_UPDATES`, `DISABLE_TELEMETRY`, `DISABLE_ERROR_REPORTING`,
  `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`,
  `CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL` and
  `CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL`.
- **What it calls.** 2.1.287 makes no request at all on the way to its prompt, and
  nothing goes through the proxy. Each prompt makes one side call to
  `POST /v1/messages?beta=true` with no tools (the session's title), and the agent's
  calls go to the same endpoint, streamed. A `UserPromptSubmit` hook's
  `additionalContext` arrives as a `system` message just after the user's message, and
  the dialect folds it into that user turn.

## Codex against the fake model

- **Seeding.** `CODEX_HOME` is `<sandbox home>/.codex`. Its `config.toml` defines a
  model provider of its own (`wire_api = "responses"`, `base_url` at the fake model,
  the fake credential in `NOVADECK_E2E_CODEX_KEY`), points `chatgpt_base_url` at the
  fake model, switches off update checks, analytics and metrics, and trusts the
  project. An empty copy of OpenAI's curated plugins keeps Codex from downloading them
  from chatgpt.com.
- **Hook trust.** Codex runs a plugin's hooks only once trusted, and NovaDeck counts
  its prompt only then. Once the plugin is connected, `connected` starts the pinned
  `codex app-server` and makes the calls its "Hooks need review" screen makes:
  `hooks/list` for each hook's current hash, then `config/batchWrite` to record them
  as trusted, and to let NovaDeck's MCP tools run without asking. It copies the hashes
  rather than computing them, so it holds as long as that protocol does, which NovaDeck's
  own trust check relies on too.
- **What it calls.** 0.159.3 sends its model calls to `POST /v1/responses`, and asks
  `GET /backend-api/plugins/featured`, which the dialect answers with none. MCP tools
  are offered in a `namespace` (`mcp__novadeck`), and the dialect names them
  `mcp__novadeck.send`. A prompt hook's context arrives as a developer message after
  the prompt; a Stop hook's reason as a user message `<hook_prompt>`, HTML-escaped. A
  call is `side` when its `x-codex-turn-metadata` says it isn't the agent's turn, as
  its thread's title.
- **Refused tunnels.** Codex's curated-plugin sync and its startup tips try GitHub,
  which no setting turns off. The proxy refuses them, and the hermetic scenario
  checks that they are the only tunnels tried.

## Antigravity against the fake model

- **The Gemini API, not Code Assist.** Signed in, Antigravity talks to Code Assist, which
  takes its models from the account's plan; under fake credentials it never loads any.
  The suite uses the route Antigravity documents for running without signing in:
  `modelProvider: "gemini"` in its settings, with `GEMINI_API_KEY` holding the fake
  credential and `GOOGLE_GEMINI_BASE_URL` pointing at the fake model. The Code Assist
  route stays untested.
- **Seeding.** `~/.gemini/antigravity-cli/settings.json` in the sandbox marks
  onboarding complete, trusts the project, picks the Gemini provider and allows
  NovaDeck's MCP tools (`mcp(novadeck_novadeck/*)`) to run without asking.
  `AGY_CLI_DISABLE_AUTO_UPDATE` stops it updating itself.
- **What it calls.** 1.2.14 streams each model call from
  `POST /v1beta/models/<model>:streamGenerateContent?alt=sse`; its session's title is a
  call with no tools, so `side`. MCP tools are lazy: it offers one `call_mcp_tool` and
  lists NovaDeck's tools in its system prompt, so the dialect offers them by the names
  Antigravity gives tools it loads (`mcp_novadeck_novadeck_send`), and encodes a call to
  one as `call_mcp_tool`. A `PreInvocation` hook's message arrives as a user content just
  after the prompt.
- **Refused tunnels.** Its feature flags (`antigravity-unleash.goog`) and telemetry
  (`play.googleapis.com`) go through the proxy, which refuses them.
- **The keyring.** Signed in on the machine, Antigravity reads its login from the secret
  service whatever HOME says. The sandbox's dead D-Bus address is what keeps it out.

## Known gaps

- **A Codex at its first screen can't be rung.** Wide and tall enough, Codex draws a
  logo on its first screen and erases it as soon as anything lands in its input box.
  The doorbell's test paste then changes rows far from its line, and the ring fails as
  it should when it can't tell what the paste did. `codex.e2e.ts` keeps this as an
  expected failure (`it.fails`), and its round trip gives the recipient one turn first.
  Once the doorbell rings such a Codex, the expected failure fails: drop `fails` and
  that first turn.
- **Antigravity often ends a turn Unknown.** Its status line still says it is working
  10 to 60 ms after its Stop hook, which NovaDeck takes for the turn going on; the idle
  that follows then leaves the terminal Unknown, never rung, in about 40% of turns.
  `agy.e2e.ts` keeps this as an expected failure (ten turns that all settle), and its
  other scenarios accept Unknown. In its round trip the sender keeps its turn open
  (a background `sleep`), so the answer comes as its Stop continuation rather than a
  ring. Once fixed, drop `fails`, wait for Settled alone, and remove the `sleep`.
