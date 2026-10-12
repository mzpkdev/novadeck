import type {
  AgentSurface,
  Anchor,
  ContractMember,
  Harness,
  Hook,
  JsonSchema,
  McpTool,
} from "../src/atlas.ts"
import type { Anchors } from "./anchors.ts"

const mcpFile = "application/runner/src/shell/mcp.ts"
const managerFile = "application/runner/src/terminals/manager.ts"
const contractFile = "harnesses/core/src/harness.ts"

// The manager method that performs each tool's call.
const handlers: Record<string, string> = {
  show: "present",
  showing: "showing",
  close: "dismiss",
  open_terminal: "open",
  close_terminal: "closePeer",
  send: "send",
  agents: "agents",
  summarize: "summarize",
}

const lineOf = (source: string | null, pattern: RegExp): number | null => {
  const index = source?.search(pattern) ?? -1
  return index === -1 || source === null ? null : source.slice(0, index).split("\n").length
}

// Each `const <tool>: Tool<…> = {…}` literal in the MCP server, evaluated for its name,
// description and input schema; the arrow functions inside it are never called.
const extractTools = (anchors: Anchors): McpTool[] => {
  const source = anchors.read(mcpFile)
  if (source === null) return []
  const listed = /const tools: readonly Tool<unknown>\[\] = \[([^\]]*)\]/.exec(source)?.[1] ?? ""
  const variables = listed
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
  const preamble = [...source.matchAll(/^const (rules|agentChoices)\b[^=]*=\s*([\s\S]*?)\n\n/gm)]
    .map(([, name, value]) => `const ${name} = ${value}`)
    .join("\n")
  const manager = anchors.read(managerFile)
  return variables.flatMap((variable) => {
    const start = source.indexOf(`const ${variable}: Tool<`)
    if (start === -1) return []
    const end = source.indexOf("\n}\n", start)
    const literal = source.slice(source.indexOf("= {", start) + 2, end + 2)
    try {
      const evaluate = new Function(
        "harnessIds",
        "harnesses",
        `${preamble}\nreturn ${literal}`,
      ) as (
        ids: string[],
        list: { id: string; name: string }[],
      ) => {
        name: string
        description: string
        inputSchema: JsonSchema
      }
      const tool = evaluate(
        ["claude", "codex", "agy"],
        [
          { id: "claude", name: "Claude Code" },
          { id: "codex", name: "Codex" },
          { id: "agy", name: "Antigravity" },
        ],
      )
      const method = handlers[tool.name]
      const line =
        method === undefined
          ? null
          : lineOf(manager, new RegExp(`^  (?:private |async )*${method}\\(`, "m"))
      const handler: Anchor | null = line === null ? null : { file: managerFile, line }
      return [
        {
          name: tool.name,
          description: tool.description,
          input: tool.inputSchema,
          anchor: { file: mcpFile, line: anchors.find(mcpFile, `const ${variable}: Tool<`) },
          handler,
        },
      ]
    } catch {
      return []
    }
  })
}

const adapters = [
  { id: "claude", title: "Claude Code" },
  { id: "codex", title: "Codex" },
  { id: "agy", title: "Antigravity" },
]

const hookSummaries: Record<string, string> = {
  SessionStart: "A session begins, resumes or restarts; binds it to the terminal.",
  UserPromptSubmit: "The person submits a prompt, which starts a turn.",
  PreInvocation: "Before each model call; delivers messages with the prompt.",
  Stop: "A turn ends; a waiting message can continue it.",
  StopFailure: "A turn ends on an API error.",
  Interrupt: "The person interrupts a turn.",
  SubagentStart: "A subagent starts.",
  SubagentStop: "A subagent ends.",
  PermissionRequest: "A request is waiting on the person.",
  Elicitation: "The agent asks the person a question.",
  ElicitationResult: "The person answered the agent's question.",
  PreToolUse: "Before a tool call; reports it, and answers at once.",
  PostToolUse: "A tool call finished; delivers the lead's messages.",
  PostToolUseFailure: "A tool call failed.",
  StatusLine: "The status line refreshes; Novadeck passes on the person's own.",
}

const hookEvents = (source: string, id: string): string[] => {
  const list = /^const events = \[([^\]]*)\]/m.exec(source)?.[1]
  if (list !== undefined) {
    return [...list.matchAll(/"(\w+)"/g)]
      .map(([, event]) => event ?? "")
      .concat(id === "claude" ? ["StatusLine"] : [])
  }
  const from = source.indexOf('path: "hooks.json"')
  const body = source.slice(from, source.indexOf("settings:", from))
  return [...new Set([...body.matchAll(/\b([A-Z]\w+): \[/g)].map(([, event]) => event ?? ""))]
}

const extractAdapters = (anchors: Anchors): { harnesses: Harness[]; hooks: Hook[] } => {
  const harnesses: Harness[] = []
  const hooks: Hook[] = []
  for (const { id, title } of adapters) {
    const file = `harnesses/${id}/src/index.ts`
    const source = anchors.read(file)
    if (source === null) continue
    const start = source.indexOf(`export const ${id} = {`)
    const end = source.indexOf("} satisfies Harness", start)
    const members = [...source.slice(start, end).matchAll(/^ {2}(\w+)\s*[:,(]/gm)].map(
      ([, name]) => name ?? "",
    )
    harnesses.push({
      id,
      title,
      package: `@novadeck/harness-${id}`,
      implements: [...new Set(members)],
      anchor: { file, line: anchors.find(file, `export const ${id} = {`) },
    })
    for (const event of hookEvents(source, id)) {
      hooks.push({
        harness: id,
        event,
        summary: hookSummaries[event] ?? "A hook Novadeck registers.",
        anchor: { file, line: anchors.find(file, `"${event}"`) ?? anchors.find(file, event) },
      })
    }
  }
  return { harnesses, hooks }
}

const memberNotes: Record<string, string> = {
  id: "Which agent it is.",
  disconnect: "Its plugin commands that remove Novadeck.",
}

// The members of `type Harness` in harnesses/core, with their doc comments' first sentence.
const extractContract = (anchors: Anchors): ContractMember[] => {
  const source = anchors.read(contractFile)
  if (source === null) return []
  const lines = source.split("\n")
  const first = lines.findIndex((line) => line.startsWith("export type Harness = {"))
  if (first === -1) return []
  const members: ContractMember[] = []
  let doc: string[] = []
  for (let index = first + 1; index < lines.length; index++) {
    const line = lines[index] ?? ""
    if (line === "}") break
    const text = line.trim()
    if (line.startsWith("  /**")) {
      doc = []
      if (text.endsWith("*/")) doc.push(text.slice(3, -2).trim())
      else if (text.length > 3) doc.push(text.slice(3).trim())
      continue
    }
    if (line.startsWith("   ") && (text.startsWith("*") || text.startsWith("/"))) {
      const piece = text.replace(/^\*\/?\s?/, "").trim()
      if (piece !== "" && !text.startsWith("*/")) doc.push(piece)
      continue
    }
    const member = /^ {2}readonly (\w+)(\?)?:/.exec(line)
    if (member) {
      const summary =
        doc.join(" ").replace(/\s+/g, " ").trim() || (memberNotes[member[1] ?? ""] ?? "")
      const sentence = /^.*?[.:](?=\s|$)/.exec(summary)?.[0] ?? summary
      members.push({
        name: member[1] ?? "",
        optional: member[2] === "?",
        summary: sentence,
        anchor: { file: contractFile, line: index + 1 },
      })
      doc = []
    }
  }
  return members
}

// Novadeck as an agent sees it: MCP tools, hooks, the harness contract and its adapters.
export const extractAgents = (_repo: string, anchors: Anchors): AgentSurface => {
  const { harnesses, hooks } = extractAdapters(anchors)
  return { tools: extractTools(anchors), hooks, contract: extractContract(anchors), harnesses }
}
