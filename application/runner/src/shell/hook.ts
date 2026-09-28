/**
 * The agent hook, run by Claude Code's SessionStart hook and Codex's through the
 * launcher on NovaDeck's own runtime, so it needs no bash or python3. It reports which
 * agent session runs in the NovaDeck terminal it was started from, and nothing else.
 * It prints nothing, since Claude Code shows a SessionStart hook's output to the model,
 * exits at once outside NovaDeck's terminals, and gives up within two seconds.
 */
export const hookScript = `// NovaDeck agent hook. Written by NovaDeck into its own data directory, and
// overwritten on each start. Only agents started from NovaDeck's terminals run it.
import { connect } from "node:net"

const agent = process.argv[2]
const env = process.env
const terminalId = env.NOVADECK_TERMINAL_ID
const endpoint = env.NOVADECK_REPORT
const token = env.NOVADECK_REPORT_TOKEN
if (!terminalId || !endpoint || !token || (agent !== "claude" && agent !== "codex")) process.exit(0)
setTimeout(() => process.exit(0), 2000).unref()
// Wall-clock time with sub-millisecond precision: a later hook reports a larger one.
const seq = performance.timeOrigin + performance.now()

// The session the payload names, unless it is not this terminal's own: a Claude Code
// subagent's, Claude Code running inside Cursor, or a Codex started by another Codex.
const sessionOf = (payload) => {
  if (typeof payload !== "object" || payload === null) return undefined
  const id = payload.session_id
  if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) return undefined
  if (payload.hook_event_name !== undefined && payload.hook_event_name !== "SessionStart")
    return undefined
  if (agent === "claude" && (payload.agent_id !== undefined || payload.cursor_version !== undefined || env.CURSOR_VERSION))
    return undefined
  if (agent === "codex" && env.CODEX_THREAD_ID && env.CODEX_THREAD_ID !== id) return undefined
  return id
}

let text = ""
process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk) => {
  text += chunk
  if (text.length > 1_000_000) process.exit(0)
})
process.stdin.on("error", () => process.exit(0))
process.stdin.on("end", () => {
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    process.exit(0)
  }
  const sessionId = sessionOf(payload)
  if (!sessionId) process.exit(0)
  const source = typeof payload.source === "string" ? payload.source.slice(0, 32) : undefined
  const socket = connect(endpoint)
  socket.on("error", () => process.exit(0))
  socket.on("close", () => process.exit(0))
  socket.end(JSON.stringify({ terminalId, token, agent, sessionId, source, seq }) + "\\n")
})
`
