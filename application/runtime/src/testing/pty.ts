import { fileURLToPath } from "node:url"

export const ptyOptions = {
  shell: process.execPath,
  shellArgs: [fileURLToPath(new URL("./pty-child.mjs", import.meta.url))],
}

export const command = (
  value:
    | { type: "write"; data: string }
    | { type: "info" }
    | { type: "burst"; data: string; count: number }
    | { type: "startNoise" }
    | { type: "stopNoise" }
    | { type: "styled"; cols: number; lines: number; checkpoint?: string }
    | { type: "exit"; code?: number; data?: string },
): string => `${Buffer.from(JSON.stringify(value)).toString("base64")}\n`
