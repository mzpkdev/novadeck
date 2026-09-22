import type { Project, Session } from "../types"

export const sessions: Session[] = [
  {
    id: "01",
    name: "Checkout implementation",
    directory: "~/projects/novadeck",
    command: "claude",
    state: "running",
    kind: "claude",
    process: "claude",
    x: 80,
    y: 80,
    height: 400,
  },
  {
    id: "02",
    name: "Dev server",
    directory: "~/projects/novadeck/ui",
    command: "pnpm dev",
    state: "running",
    kind: "server",
    process: "vite",
    x: 690,
    y: 80,
    height: 310,
  },
  {
    id: "03",
    name: "Tests",
    directory: "~/projects/novadeck/ui",
    command: "pnpm test",
    state: "running",
    kind: "tests",
    process: "vitest",
    x: 1300,
    y: 80,
    height: 385,
  },
  {
    id: "04",
    name: "Checkout review",
    directory: "~/projects/novadeck",
    command: "codex",
    state: "running",
    kind: "codex",
    process: "codex",
    x: 80,
    y: 540,
    height: 330,
  },
  {
    id: "05",
    name: "Runtime",
    directory: "~/projects/novadeck/runtime",
    command: "pnpm dev",
    state: "running",
    kind: "logs",
    process: "node",
    x: 690,
    y: 450,
    height: 375,
  },
  {
    id: "06",
    name: "Build",
    directory: "~/projects/novadeck",
    command: "pnpm build",
    state: "finished",
    kind: "build",
    process: "vite",
    x: 1300,
    y: 525,
    height: 305,
  },
]

export const initialProjects: Project[] = [
  { id: "storefront", name: "storefront", directory: "~/projects/storefront" },
  { id: "api-service", name: "api-service", directory: "~/projects/api-service" },
]

export const projectSessions = (project: Project): Session[] =>
  sessions.map((session) => ({
    ...session,
    directory: session.directory.replace(/^~\/projects\/[^/]+/, project.directory),
  }))

export const createMockTerminal = (number: number, directory: string): Session => {
  const id = String(number).padStart(2, "0")
  return {
    id,
    name: `Terminal ${id}`,
    directory,
    command: "zsh",
    process: "zsh",
    state: "idle",
    kind: "shell",
    x: 80 + ((number - 1) % 3) * 610,
    y: 80 + Math.floor((number - 1) / 3) * 470,
    height: 400,
  }
}

export const mockReply = (command: string, session: Session): string => {
  const input = command.trim()
  if (input === "help")
    return "Local demo commands: help, pwd, ls, whoami, date, echo <text>, clear"
  if (input === "pwd") return session.directory.replace("~", "/Users/alex")
  if (input === "ls")
    return "application/   node_modules/   package.json   pnpm-lock.yaml   README.md"
  if (input === "whoami") return "alex"
  if (input === "date") return new Date().toLocaleString()
  if (input === "echo") return ""
  if (input.startsWith("echo ")) return input.slice(5)
  if (session.kind === "claude" || session.kind === "codex")
    return "This is a mock AI session. Your message is saved here, but no model is connected."
  return `Preview shell: “${input}” isn't connected to a process. Type help to explore.`
}
