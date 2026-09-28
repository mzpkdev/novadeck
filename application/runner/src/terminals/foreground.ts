import { readFileSync } from "node:fs"
import { basename } from "node:path"

type ProcessStat = { pgrp: number; tty: number; tpgid: number }

// /proc/<pid>/stat puts the command in parentheses; it may itself contain spaces or ')'.
export const parseProcessStat = (stat: string): ProcessStat | null => {
  const end = stat.lastIndexOf(")")
  if (end < 0 || stat[end + 1] !== " ") return null
  const fields = stat
    .slice(end + 2)
    .trim()
    .split(/\s+/)
  const pgrp = Number(fields[2])
  const tty = Number(fields[4])
  const tpgid = Number(fields[5])
  if (!Number.isSafeInteger(pgrp) || !Number.isSafeInteger(tty) || !Number.isSafeInteger(tpgid))
    return null
  return { pgrp, tty, tpgid }
}

// Only the script Node actually executes identifies a launcher. Later arguments may
// mention another program without changing what is running.
export const nodeLauncherName = (cmdline: Buffer): "claude" | "codex" | null => {
  const [executable, script] = cmdline.toString("utf8").split("\0")
  if (!executable || !script || !["node", "nodejs"].includes(basename(executable))) return null
  if (basename(script) === "claude" || basename(script) === "codex")
    return basename(script) as "claude" | "codex"
  const path = script.replaceAll("\\", "/")
  if (path.endsWith("/@openai/codex/bin/codex.js")) return "codex"
  if (path.endsWith("/@anthropic-ai/claude-code/cli.js")) return "claude"
  return null
}

// node-pty reports the foreground group leader's argv[0]. On Linux a Node CLI
// therefore looks like "node"; inspect that same group leader, never descendants.
export const foregroundNodeLauncher = (shellPid: number): "claude" | "codex" | null => {
  try {
    const shell = parseProcessStat(readFileSync(`/proc/${shellPid}/stat`, "utf8"))
    if (!shell || shell.tty === 0 || shell.tpgid <= 0) return null
    const leader = parseProcessStat(readFileSync(`/proc/${shell.tpgid}/stat`, "utf8"))
    if (!leader || leader.pgrp !== shell.tpgid || leader.tty !== shell.tty) return null
    return nodeLauncherName(readFileSync(`/proc/${shell.tpgid}/cmdline`))
  } catch {
    // The foreground group can exit between samples; keep node-pty's name.
    return null
  }
}
