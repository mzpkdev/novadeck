# End-to-end tests

The end-to-end suite runs the real Claude Code, Codex and Antigravity TUIs in
NovaDeck's terminals, with NovaDeck's real plugin, hooks and MCP server, against a
scripted fake model. It checks agent messaging the way people use it, with real
harnesses: an agent calls `send`, NovaDeck rings the idle recipient, and the reply comes
back. The model is the one part replaced, so runs need no credentials, cost nothing and
give the same result every time.

## Running

The suite runs on Linux only. Its keyring cut is a dead D-Bus address, which doesn't
keep a harness from the macOS Keychain, and its leftover-process check reads `/proc`.
On anything else the fixture fails each test, saying so; a scenario file can skip
instead with `describe.skipIf(!supported)`, `supported` coming from `fixture.ts`.

```sh
npm run test:e2e                  # from the repository root; builds the protocol first
pnpm --filter @novadeck/protocol build
pnpm --filter @novadeck/runner test:e2e
pnpm --filter @novadeck/runner test:e2e src/e2e/claude.e2e.ts
```

The runner's own script doesn't build `@novadeck/protocol`, so build it first when
running the suite from `application/runner`, as the root script does.

The first run installs the pinned harnesses (a few hundred MB). Later runs reuse them.
Each file installs its harnesses once, before its tests, so a download counts against
the hook timeout (ten minutes) rather than a test's.

`npm run test` never runs the suite: its files end in `.e2e.ts`, and only
`application/runner/vitest.e2e.config.ts` includes them. The unit tests for its parts
(`src/e2e/**/*.test.ts`) run with the rest.

| Variable                      | Effect                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `NOVADECK_E2E_CACHE`          | Where harnesses are installed. Defaults to `$XDG_CACHE_HOME/novadeck/e2e`, or `~/.cache/novadeck/e2e` without XDG_CACHE_HOME |
| `NOVADECK_E2E_HARNESS=latest` | Installs and runs each harness's newest npm release instead of its pin, as a drift check                                     |

In CI (`.github/workflows/e2e.yml`) each harness runs in a job of its own. Its pinned
installs are restored from a cache keyed by `harnesses.json` and `install.ts`, without
npm's own cache (`<cache>/home`) or unfinished staging, and saved even when the tests
fail, so the next run needn't install again.

## What is pinned

`application/runner/src/e2e/harnesses.json` pins each harness's release:

| Harness     | Published as                                          | Version |
| ----------- | ----------------------------------------------------- | ------- |
| Claude Code | npm, `@anthropic-ai/claude-code`                      | 2.1.287 |
| Codex       | npm, `@openai/codex`                                  | 0.159.3 |
| Antigravity | an archive, by its address and SHA-512 (Linux x86-64) | 1.2.14  |

`install.ts` installs each harness into `<cache>/<harness>-<version>`, staging it first
in a folder with a random name so an interrupted install never counts as done, and
returns the folder holding its program. Should another run finish the same version
first, its folder is kept, as that run may be using it, and the staging is discarded;
an installed folder is never removed. Within a process each harness is installed once,
and `latest` looked up once. npm is the one beside the node running the tests, or the
first on PATH, and the install fails saying so when there is none. npm runs with a home
inside the cache (`<cache>/home`, which also holds npm's own cache) and a dead D-Bus
address, so neither npm nor a package's install script reads or writes the developer's
home or reaches their keyring. A version from `npm view`, from Antigravity's manifest or
from a pin must match `^[\w.+-]+$` before it names a folder. Antigravity isn't on npm: its archive is
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
  as their `baseEnv`, so they don't start from the runner's own as they do in the app,
  and runs plugin commands with it as it is (`createHarnesses`'s `login: false`), so no
  login shell's startup files, `/etc/profile` included, can put another PATH first.
- **No keyring.** `DBUS_SESSION_BUS_ADDRESS` points at a socket that doesn't exist, so
  no harness finds a login in the secret service.
- **No network, as far as harnesses honour the proxy.** The fake model is also every
  process's `HTTP(S)_PROXY`, with `NODE_USE_ENV_PROXY=1` so Node's own `fetch` takes it
  too. It refuses each tunnel and each request for another server and records its host,
  never its path. Only loopback is exempt. This blocks egress only for programs that
  honour the proxy: one that connects directly isn't stopped, and is caught only if it
  reaches a host whose failure shows. Running CI in an OS-level network namespace with no
  route out is a known follow-up.
- **No real credential.** Each harness gets a fake key that the fake model accepts. A
  request carrying any other credential, in a credential header or a `key` query
  parameter, is refused and counted, and its value is never stored; an empty header
  carries none. A request for another server is recorded by its host before it is
  refused, whatever it carried. A foreign credential fails the test, as does any request
  that tried a harness's real API host, and any request a dialect failed on, which the
  fake model records by its method, path and error message (`model.errors`), never its
  body or headers.
- **No updates.** Update checks are switched off, and npm's prefix points into the
  sandbox, so a harness that updates itself can't touch a global install.
- **A tripwire.** Before each test, the fixture notes the modification time and size of
  a list of paths in the developer's home, never their contents, and checks them again
  afterwards; a path absent both times is skipped, so CI, which has none, has nothing to
  check. It also looks for a Claude Code project named after the sandbox. The list holds
  only what a harness writes when it is configured, connected or signed in:
  - Claude Code: `~/.claude/settings.json`, `~/.claude/plugins/installed_plugins.json`
    and `~/.claude/plugins/known_marketplaces.json`.
  - Codex: `~/.codex/config.toml` (which also lists its plugins and marketplaces),
    `~/.codex/auth.json`, and the folders `~/.codex/plugins/cache` and
    `~/.codex/plugins/cache/novadeck`, where installed plugins are copied.
  - Antigravity: `~/.gemini/config/plugins` (where NovaDeck installs its plugin),
    `~/.gemini/antigravity-cli/settings.json`, and the folders
    `~/.gemini/antigravity-cli/mcp`, `plugin_data` and `bin`.

  Busy files that the developer's own running agents change constantly, such as
  histories, sessions, session indexes, sockets, logs and state, aren't on the list, so
  a real session beside the tests can't trip it.

- **Checked once the deck closes.** The fixture closes the deck, then runs its checks
  while the fake model still listens, so whatever a harness sends on its way out, such as
  telemetry flushed on exit, counts too; only then does the model close. It also looks
  in `/proc` for processes still running in the sandbox, by a working folder inside it or
  `HOME` set to its home (only that entry of a process's environment is read, and none
  of it is printed). A harness the deck's hangup reached may take a moment to exit
  (Claude Code takes about 100 ms), so each gets three seconds to end by itself. One
  still running then is ended with SIGTERM, then SIGKILL two seconds later, and fails
  the test, named by its command.
- **Enter only on text seen to land.** A deck terminal's `submit` types the text, waits
  until the screen shows it once more than it did before, and only then presses Enter.
  `press` refuses anything holding a carriage return or line feed, and the keypad's
  Enter (`\x1bOM`), so a test can't confirm a dialog or pick from a menu.

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
  setup's harness installed (once per file, before its tests), seeded and connected to
  NovaDeck through its own plugin commands. Call it at the top of the file.
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
  NovaDeck's MCP tools (`mcp(novadeck_novadeck/*)`) to run without asking. It also
  allows one command by its exact path, `wait-for`, a script the setup writes into the
  sandbox that waits until a given file exists (see Known gaps); Antigravity asks before
  running any compound shell command, so the wait can't be written inline.
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

Each is pinned by a test that asserts today's wrong behaviour, so it can't pass
unnoticed: once fixed, that test fails and says what to assert instead.

- **A Codex at its first screen can't be rung.** Wide and tall enough, Codex draws a
  logo on its first screen and erases it as soon as anything lands in its input box.
  The doorbell's test paste then changes rows far from its line, and the ring fails as
  it should when it can't tell what the paste did. `codex.e2e.ts` asserts it ("can't
  ring a Codex still at its first screen": the recipient ends Unknown, its message
  still queued), and its round trip gives the recipient one turn first. Once the
  doorbell rings such a Codex, assert it Working with the message delivered, and drop
  that first turn.
- **Antigravity often ends a turn Unknown.** Its status line still says it is working
  10 to 60 ms after its Stop hook, which NovaDeck takes for the turn going on; the idle
  that follows then leaves the terminal Unknown, never rung, in about two turns in five.
  The race is pinned deterministically in `src/messaging/messaging.test.ts` ("is left
  Unknown when its status line says working just after a Stop, then idle"), and
  `agy.e2e.ts`'s scenarios accept Settled or Unknown. In its round trip the sender keeps
  its turn open with the sandbox's `wait-for` script until the test sees the answer
  sent, so the answer comes as its Stop continuation rather than a ring. Once fixed,
  assert Settled in that unit test, wait for Settled alone, and let the sender's turn
  end so the doorbell brings the answer.
