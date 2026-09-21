import { readStatus } from "./services/status"

export type Tone = "accent" | "error" | "muted" | "output" | "success"
export type Line = { id: string; text: string; tone: Tone }
export type TabId = "assistant" | "logs" | "runtime"
export type Session = { id: TabId; lines: Line[]; title: string }

let nextLineId = 0
export const createLine = (text: string, tone: Tone): Line => ({
  id: `terminal-line-${nextLineId++}`,
  text,
  tone,
})

const initialLines: Line[] = [
  createLine("NovaDeck Terminal 0.0.0", "accent"),
  createLine("Presentation workspace connected to local runtime.", "muted"),
  createLine("Type `help` to see available commands.", "muted"),
  createLine("", "output"),
  createLine('$ novadeck deck create "A calm, privacy-first AI workspace"', "output"),
  createLine("Analyzing brief...", "muted"),
  createLine("Building a six-slide narrative...", "muted"),
  createLine("✓ Wrote ./launch-outline.deck", "success"),
  createLine("", "output"),
  createLine("  01  A calmer way to work with AI", "output"),
  createLine("  02  The cost of noisy, fragmented tools", "output"),
  createLine("  03  One private workspace for real thinking", "output"),
  createLine("  04  Control stays with your team", "output"),
  createLine("  05  From first thought to finished work", "output"),
  createLine("  06  Do your best work. Keep it yours.", "output"),
  createLine("", "output"),
  createLine("Run `novadeck deck build` to generate the presentation.", "muted"),
]

export const initialSessions: Session[] = [
  { id: "assistant", lines: initialLines, title: "Terminal 1" },
  {
    id: "runtime",
    lines: [
      createLine("NovaDeck Runtime", "accent"),
      createLine("Local API process is ready.", "success"),
      createLine("endpoint  http://127.0.0.1:8787", "output"),
      createLine("health    /api/status", "muted"),
    ],
    title: "Terminal 2",
  },
  {
    id: "logs",
    lines: [
      createLine("NovaDeck application logs", "accent"),
      createLine("15:42:08  ui       connected", "muted"),
      createLine("15:42:08  runtime  listening on 127.0.0.1:8787", "output"),
      createLine("15:42:09  deck     loaded launch-outline.deck", "success"),
    ],
    title: "Terminal 3",
  },
]

export const executeCommand = async (command: string): Promise<Line[]> => {
  const normalized = command.toLowerCase()

  if (normalized === "help") {
    return [
      createLine("Commands", "accent"),
      createLine("  help                  Show this command list", "output"),
      createLine("  status                Check the local runtime", "output"),
      createLine("  ls                    List workspace files", "output"),
      createLine("  pwd                   Print the working directory", "output"),
      createLine("  novadeck deck build   Build the current deck", "output"),
      createLine("  clear                 Clear the terminal", "output"),
    ]
  }

  if (normalized === "status") {
    try {
      const result = await readStatus()
      return [createLine(`runtime  ${result.status}`, "success")]
    } catch {
      return [createLine("runtime  unavailable", "error")]
    }
  }

  if (normalized === "ls") return [createLine("launch-outline.deck", "output")]
  if (normalized === "pwd") return [createLine("/home/novadeck", "output")]

  if (normalized === "novadeck deck build") {
    return [
      createLine("Rendering 6 slides...", "muted"),
      createLine("✓ Built ./dist/privacy-first-ai.deck", "success"),
    ]
  }

  return [
    createLine(`command not found: ${command}`, "error"),
    createLine("Type `help` for available commands.", "muted"),
  ]
}
