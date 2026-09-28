import { basename, delimiter } from "node:path"

import type { InstalledShell } from "./install.js"
import { fishQuote, psQuote } from "./scripts.js"

/**
 * How to start a shell so it loads NovaDeck's integration after the user's own setup;
 * `integrated` when it will report its prompts. `resumes` says when it runs the resume
 * command: at its first prompt, or before it at startup; undefined when it runs none.
 */
export type ShellLaunch = {
  readonly args: readonly string[]
  readonly env: NodeJS.ProcessEnv
  readonly integrated: boolean
  readonly resumes: "prompt" | "startup" | undefined
}

// "/bin/zsh", "-zsh" and "pwsh.exe" name "zsh" and "pwsh".
const shellName = (shell: string): string =>
  basename(shell.replaceAll("\\", "/"))
    .replace(/^-/, "")
    .replace(/\.exe$/i, "")
    .toLowerCase()

// Windows keeps PATH as "Path"; whichever spelling the environment uses is the one to set.
const pathKey = (env: NodeJS.ProcessEnv): string =>
  Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH"

/**
 * Arguments and environment that load the integration for shells NovaDeck knows, the
 * way VS Code does: bash reads it as its rc file, zsh finds it through ZDOTDIR, fish
 * runs it as an init command, PowerShell dot-sources it after the profile, and cmd
 * reports through its PROMPT. Each first loads the user's own startup files. Other
 * shells start as they are. Every shell gets the hook's launcher in NOVADECK_HOOK, and
 * with `codexShim` the Codex shim first on PATH.
 *
 * A `resume` command, plain words from `resumeCommand`, runs once as the shell starts,
 * as if typed at its first prompt: the integration takes it from NOVADECK_RESUME and
 * unsets it first, so nothing the command starts runs it again; cmd runs it with /k.
 */
export const shellLaunch = (
  shell: string,
  paths: InstalledShell,
  env: NodeJS.ProcessEnv,
  {
    codexShim = false,
    resume,
  }: { readonly codexShim?: boolean; readonly resume?: readonly string[] | undefined } = {},
): ShellLaunch => {
  const key = pathKey(env)
  const path = env[key]
  // Connected agents' hooks name the launcher through NOVADECK_HOOK; see `hookCommand`.
  // With the Codex shim, its folder goes first on PATH, and the integration puts it back
  // there after the user's startup files.
  const withHook = {
    ...env,
    NOVADECK_HOOK: paths.launcher,
    ...(codexShim && {
      [key]: path ? `${paths.bin}${delimiter}${path}` : paths.bin,
      NOVADECK_BIN: paths.bin,
    }),
  }
  const resuming = resume ? { ...withHook, NOVADECK_RESUME: resume.join(" ") } : withHook
  const atPrompt = resume ? "prompt" : undefined
  switch (shellName(shell)) {
    case "bash":
      return {
        args: ["--init-file", paths.bash],
        env: resuming,
        integrated: true,
        resumes: atPrompt,
      }
    case "zsh":
      // The user's ZDOTDIR, only when they have one: an unset one reads from home.
      return {
        args: [],
        env: {
          ...resuming,
          ZDOTDIR: paths.zsh,
          ...(env.ZDOTDIR ? { NOVADECK_ZDOTDIR: env.ZDOTDIR } : {}),
        },
        integrated: true,
        resumes: atPrompt,
      }
    case "fish":
      return {
        args: ["--init-command", `source ${fishQuote(paths.fish)}`],
        env: resuming,
        integrated: true,
        resumes: atPrompt,
      }
    case "pwsh":
    case "powershell":
      // A script policy that forbids the integration leaves the shell as it is.
      return {
        args: ["-NoExit", "-Command", `try { . ${psQuote(paths.powershell)} } catch {}`],
        env: resuming,
        integrated: true,
        resumes: resume ? "startup" : undefined,
      }
    case "cmd":
      // $e]9;9;$P$e\ is OSC 9;9 with the current directory, ahead of the usual prompt.
      return {
        args: resume ? ["/k", ...resume] : [],
        env: { ...withHook, PROMPT: `$e]9;9;$P$e\\${env.PROMPT || "$P$G"}` },
        integrated: true,
        resumes: resume ? "startup" : undefined,
      }
    default:
      return { args: [], env: withHook, integrated: false, resumes: undefined }
  }
}
