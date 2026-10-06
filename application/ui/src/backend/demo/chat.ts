import {
  noConversation,
  type ChatItem,
  type Conversation,
  type Conversations,
} from "../../model/conversation"
import type { WorkspaceSeed } from "../../model/seed"
import { createStore, type MutableStore } from "../../model/store"
import type { AgentStatus, TerminalMetadata, Workspace } from "../../model/types"
import type { TerminalKey } from "../port"
import { chatAgent, chatAgents } from "./samples"
import type { DemoTranscript } from "./transcripts"
import type { DemoTurns, TurnEvent } from "./turns"

export type DemoChat = {
  readonly conversations: Conversations
  // Takes the workspace as it stands, which tells what each terminal runs.
  readonly observe: (workspace: Workspace) => void
}

type Found = { readonly key: TerminalKey; readonly terminal: TerminalMetadata }

const agentOf = (terminal: TerminalMetadata): AgentStatus =>
  terminal.state === "running" ? (terminal.agent ?? { working: false }) : { working: false }

const runs = (found: Found | undefined): found is Found =>
  found !== undefined &&
  found.terminal.state === "running" &&
  chatAgent(found.terminal) !== undefined

const text = (role: ChatItem["role"], value: string) => ({
  role,
  kind: "text" as const,
  text: value,
  tool: null,
  call: null,
  author: null,
})

// What each demo agent's tool does as its turn runs, by harness.
const toolRun = (agent: string, terminal: TerminalMetadata, call: string) =>
  agent === "agy"
    ? {
        tool: "run_command",
        input: JSON.stringify({
          CommandLine: JSON.stringify("git status --short"),
          Cwd: JSON.stringify(terminal.directory),
          toolAction: JSON.stringify("Running git status"),
        }),
        output: "Exit code: 0\nOutput:\n M src/runtime/server.ts\n",
        call,
      }
    : agent === "codex"
      ? {
          tool: "exec_command",
          input: JSON.stringify({
            cmd: "git status --short",
            workdir: terminal.directory,
          }),
          output:
            "Chunk ID: 3f9c1a\nWall time: 0.0000 seconds\nProcess exited with code 0\nOutput:\n M src/checkout/total.ts\n",
          call,
        }
      : {
          tool: "Bash",
          input: JSON.stringify({
            command: "git status --short",
            description: "Show what changed",
          }),
          output: " M src/checkout/total.ts",
          call,
        }

// The demo's conversations: each terminal running Claude Code or Codex opens with its
// `transcripts` entry, and a prompt sent to it drives the same simulated turn as one typed
// in its screen, which `turns` runs. Only terminals idle at their prompt take a prompt.
export const createDemoChat = (
  seed: WorkspaceSeed,
  transcripts: Readonly<Record<string, DemoTranscript>>,
  turns: DemoTurns,
): DemoChat => {
  let latest: Workspace | undefined
  const stores = new Map<string, MutableStore<Conversation>>()
  // Terminal ids repeat across projects; the active project's terminal answers first.
  const locate = (terminalId: string): Found | undefined => {
    if (latest) {
      const projects = [
        ...latest.projects.filter((project) => project.id === latest!.activeProjectId),
        ...latest.projects,
      ]
      for (const project of projects)
        for (const session of project.history) {
          const terminal = session.state.roster.terminals.find((each) => each.id === terminalId)
          if (terminal)
            return {
              key: {
                projectId: project.id,
                workspaceSessionId: session.id,
                terminalId,
              },
              terminal,
            }
        }
      return undefined
    }
    for (const project of seed.projects)
      for (const session of project.sessions) {
        const terminal = session.terminals.find((each) => each.id === terminalId)
        if (terminal)
          return {
            key: {
              projectId: project.id,
              workspaceSessionId: session.id,
              terminalId,
            },
            terminal,
          }
      }
    return undefined
  }
  const opened = (found: Found | undefined): Conversation => {
    if (!runs(found)) return noConversation
    const transcript = transcripts[found.terminal.id]
    return {
      agent: found.terminal.process,
      session: `demo-${found.terminal.id}`,
      loaded: true,
      items: transcript?.items ?? [],
      requests: transcript?.requests ?? [],
    }
  }
  const storeOf = (terminalId: string): MutableStore<Conversation> => {
    const existing = stores.get(terminalId)
    if (existing) return existing
    const store = createStore(opened(locate(terminalId)))
    stores.set(terminalId, store)
    return store
  }
  const append = (terminalId: string, ...drafts: Omit<ChatItem, "id" | "at" | "truncated">[]) =>
    storeOf(terminalId).update((conversation) => ({
      ...conversation,
      items: [
        ...conversation.items,
        ...drafts.map((draft, index) => ({
          ...draft,
          id: `${terminalId}:${conversation.items.length + index + 1}`,
          at: Date.now(),
          truncated: false,
        })),
      ],
    }))
  turns.watch((event: TurnEvent) => {
    const { terminalId } = event.key
    if (event.type === "begin") append(terminalId, text("user", event.prompt))
    else if (event.type === "tool") {
      const found = locate(terminalId)
      if (!found) return
      const items = storeOf(terminalId).getSnapshot().items
      const run = toolRun(
        String(found.terminal.process),
        found.terminal,
        `demo-call-${items.length}`,
      )
      append(
        terminalId,
        {
          role: "assistant",
          kind: "tool-call",
          text: run.input,
          tool: run.tool,
          call: run.call,
          author: null,
        },
        {
          role: "tool",
          kind: "tool-result",
          text: run.output,
          tool: null,
          call: run.call,
          author: null,
        },
      )
    } else if (event.outcome === "completed" && event.reply) {
      append(terminalId, text("assistant", event.reply))
    } else {
      // A refused request is answered.
      storeOf(terminalId).update((conversation) =>
        conversation.requests.length ? { ...conversation, requests: [] } : conversation,
      )
    }
  })
  const agentFor = (terminalId: string): Found => {
    const found = locate(terminalId)
    if (!runs(found))
      throw new Error(
        "No agent is running in this terminal. Start Claude Code, Codex or Antigravity in it first.",
      )
    return found
  }
  return {
    conversations: {
      conversation: storeOf,
      send: async (terminalId, prompt) => {
        const found = agentFor(terminalId)
        const name = chatAgents[chatAgent(found.terminal)!]
        const agent = agentOf(found.terminal)
        if (agent.attention)
          throw new Error(
            `${name} is waiting for your answer in its terminal. Answer it there first.`,
          )
        if (agent.working || turns.working(found.key))
          throw new Error(`${name} is still working. Stop it or wait until it finishes.`)
        if (!prompt.trim()) return
        turns.prompt(prompt, found.terminal, found.key)
      },
      interrupt: async (terminalId) => {
        const found = agentFor(terminalId)
        turns.interrupt(found.key, agentOf(found.terminal))
      },
    },
    observe: (workspace) => {
      latest = workspace
      for (const [terminalId, store] of stores) {
        const found = locate(terminalId)
        store.update((conversation) => {
          if (!runs(found)) return conversation.agent === null ? conversation : noConversation
          if (conversation.agent === null) return opened(found)
          // Nothing waits once the agent has nothing to ask.
          return !agentOf(found.terminal).attention && conversation.requests.length
            ? { ...conversation, requests: [] }
            : conversation
        })
      }
    },
  }
}
