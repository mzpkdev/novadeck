# Backend API

This is the first backend-only implementation of the [terminal plan](backend-plan.md).
The UI and Electron host still use their existing behavior; neither connects to
this terminal API yet.

## Run and test

Use the repository's Node.js 26 and pnpm versions. `node-pty` is a native dependency;
installation can require Python and a C/C++ toolchain for your platform.
The pinned `node-pty` 1.1.0 dependency has an installation patch for its published
macOS spawn-helper permissions ([upstream issue](https://github.com/microsoft/node-pty/issues/850)).
Keep its pnpm build script enabled; this repair applies to regular installs as well as CI.

From the repository root:

```sh
pnpm install
pnpm exec turbo run build --filter=@novadeck/runtime
cp application/runtime/example.env application/runtime/.env
```

Generate a credential with the command in `example.env`, then set `NOVADECK_TOKEN`
in the ignored `.env` file. Leave `HOST=127.0.0.1` for local testing. Run:

```sh
pnpm --filter @novadeck/runtime start
pnpm --filter @novadeck/runtime test
```

Build the protocol package again after changing its schemas or client. The runtime
test command rebuilds its own CLI before running. Tests use ephemeral listeners,
temporary SQLite files, and real PTYs; the UI is not involved.

- API tests use a small controllable child program inside a real PTY. Separate
  smoke tests exercise the platform shell and launch the built CLI in a fresh
  process, including configuration, authentication, and metadata across restarts.
- Recovery tests feed terminal events into headless xterm instances and compare
  screen state before and after reconnection, including cursor position, styling,
  alternate buffers, Unicode, and resize events.
- Generated fast-check command sequences exercise ownership and output-budget
  accounting. Failures report a seed and shrink path for reproduction.
- Each test owns its resources. Cleanup attempts every registered release, even
  if another cleanup fails.

Backend CI runs on Linux, macOS, and Windows. POSIX signal and hangup assertions
are explicitly platform-specific; Windows process termination is not a graceful
SIGTERM test. Packaged Electron terminal support and remote TLS deployment remain
verification gates before integration.

Without a token, the runtime exposes only the existing HTTP status behavior.
With a token, the RPC WebSocket endpoint is `/api/rpc`. The CLI persists metadata
at `~/.local/share/novadeck/workspace.sqlite` unless `NOVADECK_DATABASE` is set.
Programmatic `startRuntime` from `@novadeck/runtime/terminal` uses an in-memory
database when no path is supplied. The original package entry remains HTTP-only
so existing Electron builds do not pull in native terminal dependencies.

For a VPS, terminate TLS at a trusted reverse proxy and forward WebSocket upgrades.
Set `CORS_ORIGINS` to the exact trusted frontend origins. A static UI can later
connect directly over WSS; it does not need a terminal backend on Cloudflare.
Follow the [runtime trust boundary](../SECURITY.md#terminal-runtime) before exposing
the service. There is no TLS, login page, or public multi-user hosting layer here.

## Contract shape

`@novadeck/protocol` contains runtime-validated Zod schemas, oRPC contracts, inferred
TypeScript types, and a browser-compatible client. The runtime implements that
contract; it does not expose arbitrary event-name handlers. oRPC is pinned to
1.15.4: its installed API uses `eventIterator` and the server's `ws` adapter.
The client keeps the standard oRPC wire protocol with a small transport adapter
that safely settles cancellation when a socket closes.

```ts
import { protocolVersion } from "@novadeck/protocol"
import { createRuntimeClient } from "@novadeck/protocol/client"

const socket = new WebSocket("ws://127.0.0.1:8787/api/rpc")
socket.binaryType = "arraybuffer"
const client = createRuntimeClient(socket)
const runtime = await client.runtime.handshake({ protocolVersion, token })

const project = await client.projects.create({ name: "My project", cwd: "/work/project" })
const session = await client.sessions.create({ projectId: project.id, name: "Development" })
const terminal = await client.terminals.create({ sessionId: session.id, cols: 120, rows: 30 })
```

The handshake is required for every connection and returns `runtimeId`, protocol
version, and capabilities. The token is sent in-band, never in a URL. Unauthenticated
connections time out after ten seconds. Existing projects/sessions can be listed
and renamed; `terminals.list({ sessionId })` discovers live and retained exited
terminals. Creation uses the project's directory unless `cwd` is supplied.
Directories must exist and be absolute. The server chooses the shell; clients
send terminal input, not executable configuration.

```ts
const controller = new AbortController()
const events = await client.terminals.attach(
  { terminalId: terminal.id, mode: "control" },
  { signal: controller.signal },
)

for await (const event of events) {
  // Apply snapshot/output/resized/exited, then ACK after actual consumption.
  await client.terminals.ack({ terminalId: terminal.id, sequence: event.sequence })
}

// Independent of reading the stream:
await client.terminals.write({ terminalId: terminal.id, data: "pwd\r" })
await client.terminals.resize({ terminalId: terminal.id, cols: 100, rows: 32 })
await client.terminals.close({ terminalId: terminal.id })
```

The last three calls illustrate the separate command path; in a client they run
alongside the event consumer. `write` accepts control characters, including Ctrl-C
(`\u0003`). A successful write means accepted input, not command completion.
Never automatically retry input or creation after uncertain delivery.

## Stream and lifetime rules

- Creation grants the creating connection control. Only that connection can
  write, resize, or close. Another connection can attach with `mode: "observe"`.
  There is one attachment per terminal per connection. Cancelling a controlling
  attachment or disconnecting releases control, but leaves the shell running.
- Events carry `terminalId` and an increasing `sequence`. Initial attachment emits
  a serialized screen snapshot with dimensions and running/exited state. Output,
  resize, and exit events follow in order. A snapshot replaces the old screen; it
  is not appended. ACK snapshots too, including sequence zero.
- Reconnect with a new socket/client and handshake. Attach using `afterSequence`
  from the last fully applied event. Available history is replayed; an expired
  cursor falls back to a fresh snapshot. A future cursor is rejected. Scope saved
  cursors to both runtime identity and terminal ID. Reconnection is explicit, not
  hidden in the client helper.
- Default limits are 32 connections and 32 retained terminals, 64 KiB incoming
  WebSocket messages, 16,384 characters per input call, 1 MiB replay per terminal,
  4 MiB queued/unacknowledged events per attachment, and a 256 KiB ACK window.
  Old exited, unattached records are evicted when capacity is needed. Headless
  screens keep 1,000 scrollback lines. These are bounded recent history, not a
  durable transcript.
- Initial snapshots have a separate 32 MiB allowance. Older scrollback is omitted
  if needed to fit that budget; the visible screen is never silently truncated.
  A pathological visible screen that still exceeds it fails with
  `SNAPSHOT_TOO_LARGE`, not a retryable slow-viewer error. Recovery then requires
  reducing the screen contents outside that failed attachment or restarting the
  terminal. Snapshot chunking is not implemented in this version.
- A viewer exceeding its budget receives `SLOW_CONSUMER` and must attach again.
  The process keeps running. Dead connections are detected by 30-second ping/pong
  heartbeats, normally within two intervals. Slow viewers do not block the runtime
  from draining output or accepting another connection's input.
- Runtime shutdown ends owned PTYs. Backend restarts preserve only project/session
  metadata, not processes, terminal records, screens, or replay cursors. There is
  no persistent process supervisor, layout storage, or terminal configuration
  persistence in this slice.
- Closing sends a hangup to the owned shell, escalating if the shell ignores it.
  It is not a process-tree kill guarantee: daemonized jobs and descendants that
  ignore hangup may continue, as with an ordinary terminal emulator. Use an OS
  service/cgroup or a future supervisor if all descendant cleanup is required.

Typed errors include `UNAUTHORIZED`, `INCOMPATIBLE_PROTOCOL`, `INVALID_DIRECTORY`,
`TERMINAL_NOT_FOUND`, `CONTROL_REQUIRED`, `CONTROL_IN_USE`, `INVALID_CURSOR`,
`RESOURCE_LIMIT`, and `SLOW_CONSUMER`. The schemas and contract in
`application/protocol/src/` are the authoritative API definition.
