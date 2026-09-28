import { basename } from "node:path"

import { fishQuote, psQuote, type ShellPaths } from "./scripts.js"

/**
 * How to start a shell so it loads NovaDeck's integration after the user's own setup;
 * `integrated` when it will report its prompts.
 */
export type ShellLaunch = {
  readonly args: readonly string[]
  readonly env: NodeJS.ProcessEnv
  readonly integrated: boolean
}

// "/bin/zsh", "-zsh" and "pwsh.exe" name "zsh" and "pwsh".
const shellName = (shell: string): string =>
  basename(shell.replaceAll("\\", "/"))
    .replace(/^-/, "")
    .replace(/\.exe$/i, "")
    .toLowerCase()

/**
 * Arguments and environment that load the integration for shells NovaDeck knows, the
 * way VS Code does: bash reads it as its rc file, zsh finds it through ZDOTDIR, fish
 * runs it as an init command, PowerShell dot-sources it after the profile, and cmd
 * reports through its PROMPT. Each first loads the user's own startup files. Other
 * shells start as they are. Every shell gets the hook's launcher in NOVADECK_HOOK.
 */
export const shellLaunch = (
  shell: string,
  paths: ShellPaths,
  env: NodeJS.ProcessEnv,
): ShellLaunch => {
  // Connected agents' hooks name the launcher through this; see `hookCommand`.
  const withHook = { ...env, NOVADECK_HOOK: paths.launcher }
  switch (shellName(shell)) {
    case "bash":
      return { args: ["--init-file", paths.bash], env: withHook, integrated: true }
    case "zsh":
      // The user's ZDOTDIR, only when they have one: an unset one reads from home.
      return {
        args: [],
        env: {
          ...withHook,
          ZDOTDIR: paths.zsh,
          ...(env.ZDOTDIR ? { NOVADECK_ZDOTDIR: env.ZDOTDIR } : {}),
        },
        integrated: true,
      }
    case "fish":
      return {
        args: ["--init-command", `source ${fishQuote(paths.fish)}`],
        env: withHook,
        integrated: true,
      }
    case "pwsh":
    case "powershell":
      // A script policy that forbids the integration leaves the shell as it is.
      return {
        args: ["-NoExit", "-Command", `try { . ${psQuote(paths.powershell)} } catch {}`],
        env: withHook,
        integrated: true,
      }
    case "cmd":
      // $e]9;9;$P$e\ is OSC 9;9 with the current directory, ahead of the usual prompt.
      return {
        args: [],
        env: { ...withHook, PROMPT: `$e]9;9;$P$e\\${env.PROMPT || "$P$G"}` },
        integrated: true,
      }
    default:
      return { args: [], env: withHook, integrated: false }
  }
}
