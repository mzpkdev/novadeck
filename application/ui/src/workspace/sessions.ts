export type Session = {
  id: string
  name: string
  directory: string
  command: string
  process: string
  state: "running" | "idle" | "finished"
  kind: "shell" | "server" | "tests" | "git" | "logs" | "build"
  x: number
  y: number
  height: number
}

export const sessions: Session[] = [
  {
    id: "01",
    name: "Workspace",
    directory: "~/projects/novadeck",
    command: "zsh",
    state: "idle",
    kind: "shell",
    process: "zsh",
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
    name: "Git",
    directory: "~/projects/novadeck",
    command: "git status",
    state: "idle",
    kind: "git",
    process: "git",
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
  return `Preview shell: “${input}” isn't connected to a process. Type help to explore.`
}
