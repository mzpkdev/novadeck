import { homedir } from "node:os"
import { basename, delimiter } from "node:path"

import { fishQuote, psQuote, type ShellPaths } from "./scripts.js"

/** How to start a shell so it loads NovaDeck's integration after the user's own setup. */
export type ShellLaunch = { readonly args: readonly string[]; readonly env: NodeJS.ProcessEnv }

// "/bin/zsh", "-zsh" and "pwsh.exe" name "zsh" and "pwsh".
const shellName = (shell: string): string =>
  basename(shell.replaceAll("\\", "/"))
    .replace(/^-/, "")
    .replace(/\.exe$/i, "")
    .toLowerCase()

// Windows keeps PATH as "Path"; whichever spelling the environment uses is the one to set.
const pathKey = (env: NodeJS.ProcessEnv): string =>
  Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH"

/**
 * Arguments and environment that load the integration for shells NovaDeck knows, the
 * way VS Code does: bash reads it as its rc file, zsh finds it through ZDOTDIR, fish
 * runs it as an init command, PowerShell dot-sources it after the profile, and cmd
 * reports through its PROMPT. Each first loads the user's own startup files. Other
 * shells start as they are. Every shell gets the shims first on PATH and the hook's
 * launcher in NOVADECK_HOOK.
 */
export const shellLaunch = (
  shell: string,
  paths: ShellPaths,
  env: NodeJS.ProcessEnv,
): ShellLaunch => {
  const key = pathKey(env)
  const path = env[key]
  const withBin = {
    ...env,
    [key]: path ? `${paths.bin}${delimiter}${path}` : paths.bin,
    // The agents' hook commands name the launcher through this; see `hookCommand`.
    NOVADECK_HOOK: paths.hook,
    // The integration puts the shims back in front after the user's startup files.
    NOVADECK_BIN: paths.bin,
  }
  switch (shellName(shell)) {
    case "bash":
      return { args: ["--init-file", paths.bash], env: withBin }
    case "zsh":
      return {
        args: [],
        env: {
          ...withBin,
          ZDOTDIR: paths.zsh,
          NOVADECK_ZDOTDIR: env.ZDOTDIR || env.HOME || homedir(),
        },
      }
    case "fish":
      return { args: ["--init-command", `source ${fishQuote(paths.fish)}`], env: withBin }
    case "pwsh":
    case "powershell":
      return {
        args: ["-NoExit", "-Command", `. ${psQuote(paths.powershell)}`],
        env: withBin,
      }
    case "cmd":
      // $e]9;9;$P$e\ is OSC 9;9 with the current directory, ahead of the usual prompt.
      return { args: [], env: { ...withBin, PROMPT: `$e]9;9;$P$e\\${env.PROMPT || "$P$G"}` } }
    default:
      return { args: [], env: withBin }
  }
}
