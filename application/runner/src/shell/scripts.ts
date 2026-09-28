import { join } from "node:path"

// The files NovaDeck puts in shells it starts, and the plugins agents install when the
// person connects them, as text. They are written into NovaDeck's own data directory;
// only connecting an agent installs anything elsewhere, through the agent's own commands.

/** Where each file lives under the shell directory. */
export type ShellPaths = {
  readonly directory: string
  readonly bash: string
  /** ZDOTDIR for zsh. */
  readonly zsh: string
  readonly fish: string
  readonly powershell: string
  /**
   * The plugin sources each agent installs from when the person connects it: a local
   * marketplace for Claude Code and Codex, a plugin folder for Antigravity.
   */
  readonly plugins: { readonly claude: string; readonly codex: string; readonly agy: string }
  /** The hook's launcher, which NovaDeck's shells name in NOVADECK_HOOK. */
  readonly hook: string
  readonly hookScript: string
}

export const shellPaths = (directory: string, platform = process.platform): ShellPaths => ({
  directory,
  bash: join(directory, "bash", "novadeck.bash"),
  zsh: join(directory, "zsh"),
  fish: join(directory, "fish", "novadeck.fish"),
  powershell: join(directory, "powershell", "novadeck.ps1"),
  plugins: {
    claude: join(directory, "plugins", "claude"),
    codex: join(directory, "plugins", "codex"),
    agy: join(directory, "plugins", "agy", "novadeck"),
  },
  hook: join(directory, platform === "win32" ? "hook.cmd" : "hook"),
  hookScript: join(directory, "hook.mjs"),
})

// Quoting for each language a path is written into.
export const shQuote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`
export const psQuote = (value: string): string => `'${value.replaceAll("'", "''")}'`
export const fishQuote = (value: string): string =>
  `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`
// Batch files expand %VAR% even inside quotes; a path cannot hold a double quote.
const cmdQuote = (value: string): string => `"${value.replaceAll("%", "%%")}"`

const header = (comment: string, what: string): string =>
  [
    `${comment} NovaDeck ${what}.`,
    `${comment} Written by NovaDeck into its own data directory, and overwritten on each start.`,
    `${comment} Only NovaDeck's shells, and agents you connected, use it.`,
  ].join("\n")

/**
 * bash, started with `--init-file`: reads the user's own ~/.bashrc as bash would, then
 * reports the directory at each prompt with OSC 7.
 */
const bash = `${header("#", "shell integration for bash")}
if [ -f ~/.bashrc ]; then . ~/.bashrc; fi

__novadeck_prompt() {
  local status=$? LC_ALL=C path=$PWD encoded= char byte i
  for (( i = 0; i < \${#path}; i++ )); do
    char=\${path:i:1}
    case $char in
      [a-zA-Z0-9/._~-]) encoded+=$char ;;
      # bash 3.2, as macOS ships, reads a byte above 127 as negative.
      *) printf -v byte '%d' "'$char"; printf -v char '%%%02X' $(( byte & 255 )); encoded+=$char ;;
    esac
  done
  printf '\\033]7;file://%s%s\\033\\\\' "\${HOSTNAME:-}" "$encoded"
  return $status
}

if [[ "$(declare -p PROMPT_COMMAND 2>/dev/null)" == "declare -a"* ]]; then
  PROMPT_COMMAND=(__novadeck_prompt "\${PROMPT_COMMAND[@]}")
else
  PROMPT_COMMAND="__novadeck_prompt\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
fi
`

// zsh reads its startup files from ZDOTDIR, which NovaDeck points here. .zshenv reads
// the user's own with ZDOTDIR as they had it (NOVADECK_ZDOTDIR, or unset), and notes
// where their .zshenv left it; later files read the user's from there. .zshrc hands
// ZDOTDIR back, so .zlogin and any nested zsh read theirs.
const zshenv = `${header("#", "shell integration for zsh")}
__novadeck_zdotdir=$ZDOTDIR
if [[ -n "\${NOVADECK_ZDOTDIR+set}" ]]; then ZDOTDIR=$NOVADECK_ZDOTDIR; else unset ZDOTDIR; fi
if [[ -f "\${ZDOTDIR:-$HOME}/.zshenv" ]]; then . "\${ZDOTDIR:-$HOME}/.zshenv"; fi
NOVADECK_ZDOTDIR=\${ZDOTDIR:-$HOME}
ZDOTDIR=$__novadeck_zdotdir
unset __novadeck_zdotdir
`

const zprofile = `${header("#", "shell integration for zsh")}
if [[ -f "$NOVADECK_ZDOTDIR/.zprofile" ]]; then
  __novadeck_zdotdir=$ZDOTDIR
  ZDOTDIR=$NOVADECK_ZDOTDIR
  . "$ZDOTDIR/.zprofile"
  NOVADECK_ZDOTDIR=$ZDOTDIR
  ZDOTDIR=$__novadeck_zdotdir
  unset __novadeck_zdotdir
fi
`

const zshrc = `${header("#", "shell integration for zsh")}
__novadeck_zdotdir=$ZDOTDIR
ZDOTDIR=$NOVADECK_ZDOTDIR
unset NOVADECK_ZDOTDIR
# A system zshrc read before this one, as macOS's, may have put history here.
if [[ "$HISTFILE" == "$__novadeck_zdotdir"/* ]]; then HISTFILE=$ZDOTDIR/.zsh_history; fi
unset __novadeck_zdotdir
if [[ -f "$ZDOTDIR/.zshrc" ]]; then . "$ZDOTDIR/.zshrc"; fi

__novadeck_prompt() {
  emulate -L zsh
  setopt extendedglob
  unsetopt multibyte
  local encoded=\${PWD//(#m)[^a-zA-Z0-9\\/._~-]/%\${(l:2::0:)$(( [##16] #MATCH ))}}
  print -rn -- $'\\e]7;file://'"\${HOST}\${encoded}"$'\\e\\\\'
}
autoload -Uz add-zsh-hook
add-zsh-hook precmd __novadeck_prompt
`

const fish = `${header("#", "shell integration for fish")}
function __novadeck_prompt --on-event fish_prompt
    printf '\\e]7;file://%s%s\\e\\\\' $hostname (string escape --style=url -- $PWD)
end
`

// PowerShell loads the user's profile before -Command runs this. The prompt reports
// the directory with OSC 9;9, as Windows Terminal documents, around the user's own.
const powershell = `${header("#", "shell integration for PowerShell")}
$global:__NovaDeckPrompt = $function:prompt
function global:prompt {
  $prompt = & $global:__NovaDeckPrompt
  $location = $executionContext.SessionState.Path.CurrentLocation
  if ($location.Provider.Name -ne 'FileSystem') { return $prompt }
  "$([char]27)]9;9;\`"$($location.ProviderPath)\`"$([char]27)\\$prompt"
}
`

export type HookedAgent = "claude" | "codex" | "agy"

/**
 * The hook command each agent's plugin runs, through the agent's own shell: sh (Claude
 * Code, Antigravity) or the login shell (Codex) elsewhere; on Windows, PowerShell for
 * Claude Code and cmd for the others. Outside NovaDeck's shells NOVADECK_HOOK is unset
 * and the command does nothing, so a plugin left behind never gets in the way.
 * Antigravity expects JSON back even then. Codex and Antigravity trust a hook by its
 * definition, so these strings must never change.
 */
export const hookCommand = (agent: HookedAgent, platform = process.platform): string => {
  if (platform === "win32") {
    if (agent === "claude")
      return "if ($env:NOVADECK_HOOK) { $input | & $env:NOVADECK_HOOK claude }"
    if (agent === "agy") return 'if defined NOVADECK_HOOK ("%NOVADECK_HOOK%" agy) else (echo {})'
    return 'if defined NOVADECK_HOOK "%NOVADECK_HOOK%" codex'
  }
  if (agent === "agy")
    return `if [ -n "$NOVADECK_HOOK" ]; then "$NOVADECK_HOOK" agy; else echo '{}'; fi`
  return `[ -n "$NOVADECK_HOOK" ] && "$NOVADECK_HOOK" ${agent} || true`
}

const plugin = {
  name: "novadeck",
  version: "1.0.0",
  description: "Tells NovaDeck which session runs in its terminal, so it can resume it.",
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

// Claude Code and Codex install from a marketplace; both read this local one.
const marketplace = json({
  name: "novadeck",
  owner: { name: "NovaDeck" },
  plugins: [{ name: "novadeck", source: "./novadeck", description: plugin.description }],
})

const claudeHooks = (platform: NodeJS.Platform) => ({
  hooks: {
    SessionStart: [
      {
        hooks: [
          {
            type: "command",
            command: hookCommand("claude", platform),
            ...(platform === "win32" && { shell: "powershell" }),
          },
        ],
      },
    ],
  },
})

const codexHooks = (platform: NodeJS.Platform) => ({
  hooks: {
    SessionStart: [
      {
        matcher: "startup|resume|clear|compact",
        hooks: [{ type: "command", command: hookCommand("codex", platform) }],
      },
    ],
  },
})

// Antigravity runs PreInvocation hooks before each model call, the first time with the
// conversation's first message.
const agyHooks = (platform: NodeJS.Platform) => ({
  novadeck: { PreInvocation: [{ type: "command", command: hookCommand("agy", platform) }] },
})

// The launcher runs the hook on NovaDeck's own runtime: Electron acting as Node, or Node
// itself for a standalone runner. It is rewritten on each start, as that path moves.
const posixLauncher = (runtime: string, paths: ShellPaths): string => `#!/bin/sh
${header("#", "agent hook launcher")}
ELECTRON_RUN_AS_NODE=1
export ELECTRON_RUN_AS_NODE
exec ${shQuote(runtime)} ${shQuote(paths.hookScript)} "$@"
`

const cmdLauncher = (runtime: string, paths: ShellPaths): string => `@echo off
${header("rem", "agent hook launcher")}
set ELECTRON_RUN_AS_NODE=1
${cmdQuote(runtime)} ${cmdQuote(paths.hookScript)} %*
`

export type ShellFile = { readonly path: string; readonly content: string; readonly mode: number }

const file = (path: string, content: string, mode = 0o600): ShellFile => ({ path, content, mode })

/** Every file for this platform, with the permissions each needs. */
export const shellFiles = (
  paths: ShellPaths,
  runtime: string,
  hookScript: string,
  platform = process.platform,
): ShellFile[] => {
  const { claude, codex, agy } = paths.plugins
  const common = [
    file(paths.bash, bash),
    file(join(paths.zsh, ".zshenv"), zshenv),
    file(join(paths.zsh, ".zprofile"), zprofile),
    file(join(paths.zsh, ".zshrc"), zshrc),
    file(paths.fish, fish),
    file(paths.powershell, powershell),
    file(join(claude, ".claude-plugin", "marketplace.json"), marketplace),
    file(join(claude, "novadeck", ".claude-plugin", "plugin.json"), json(plugin)),
    file(join(claude, "novadeck", "hooks", "hooks.json"), json(claudeHooks(platform))),
    file(join(codex, ".claude-plugin", "marketplace.json"), marketplace),
    file(
      join(codex, "novadeck", ".codex-plugin", "plugin.json"),
      json({ ...plugin, hooks: "./hooks/hooks.json" }),
    ),
    file(join(codex, "novadeck", "hooks", "hooks.json"), json(codexHooks(platform))),
    file(join(agy, "plugin.json"), json({ name: plugin.name })),
    file(join(agy, "hooks.json"), json(agyHooks(platform))),
    file(paths.hookScript, hookScript),
  ]
  return platform === "win32"
    ? [...common, file(paths.hook, cmdLauncher(runtime, paths))]
    : [...common, file(paths.hook, posixLauncher(runtime, paths), 0o700)]
}
