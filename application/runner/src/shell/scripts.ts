import { join } from "node:path"

// The files NovaDeck puts in shells it starts, as text. They are written into its own
// data directory, never into the user's files, and only its shells load them.

/** Where each file lives under the shell directory. */
export type ShellPaths = {
  readonly directory: string
  /** Prepended to PATH in NovaDeck's shells: the `claude` and `codex` shims. */
  readonly bin: string
  readonly bash: string
  /** ZDOTDIR for zsh. */
  readonly zsh: string
  readonly fish: string
  readonly powershell: string
  /** Claude Code's per-run plugin, loaded with `--plugin-dir`. */
  readonly claudePlugin: string
  /** The hook's launcher. Its path is the hook command, so it never changes. */
  readonly hook: string
  readonly hookScript: string
}

export const shellPaths = (directory: string, platform = process.platform): ShellPaths => ({
  directory,
  bin: join(directory, "bin"),
  bash: join(directory, "bash", "novadeck.bash"),
  zsh: join(directory, "zsh"),
  fish: join(directory, "fish", "novadeck.fish"),
  powershell: join(directory, "powershell", "novadeck.ps1"),
  claudePlugin: join(directory, "claude"),
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
    `${comment} Only shells NovaDeck starts load it; nothing else of yours is changed.`,
  ].join("\n")

/**
 * bash, started with `--init-file`: reads the user's own ~/.bashrc as bash would, then
 * reports the directory at each prompt with OSC 7.
 */
const bash = `${header("#", "shell integration for bash")}
if [ -f ~/.bashrc ]; then . ~/.bashrc; fi
# Your startup files may put other directories first; the agent shims go back in front.
case "$PATH" in "$NOVADECK_BIN":*) ;; *) PATH="$NOVADECK_BIN:$PATH" ;; esac

__novadeck_prompt() {
  local status=$? LC_ALL=C path=$PWD encoded= char i
  for (( i = 0; i < \${#path}; i++ )); do
    char=\${path:i:1}
    case $char in
      [a-zA-Z0-9/._~-]) encoded+=$char ;;
      *) printf -v char '%%%02X' "'$char"; encoded+=$char ;;
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

// zsh reads its startup files from ZDOTDIR, which NovaDeck points here. Each file reads
// the user's own from NOVADECK_ZDOTDIR (their ZDOTDIR, or home), which their .zshenv
// may move. .zshrc hands ZDOTDIR back, so .zlogin and any nested zsh read theirs.
const zshStep = (file: string): string => `${header("#", "shell integration for zsh")}
if [[ -f "$NOVADECK_ZDOTDIR/${file}" ]]; then
  __novadeck_zdotdir=$ZDOTDIR
  ZDOTDIR=$NOVADECK_ZDOTDIR
  . "$ZDOTDIR/${file}"
  NOVADECK_ZDOTDIR=$ZDOTDIR
  ZDOTDIR=$__novadeck_zdotdir
  unset __novadeck_zdotdir
fi
`

const zshrc = `${header("#", "shell integration for zsh")}
ZDOTDIR=$NOVADECK_ZDOTDIR
unset NOVADECK_ZDOTDIR
if [[ -f "$ZDOTDIR/.zshrc" ]]; then . "$ZDOTDIR/.zshrc"; fi
# Your startup files may put other directories first; the agent shims go back in front.
[[ "$PATH" == "$NOVADECK_BIN":* ]] || PATH="$NOVADECK_BIN:$PATH"

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
# Your configuration may put other directories first; the agent shims go back in front,
# for this shell only.
set -gx PATH $NOVADECK_BIN (string match -v -- $NOVADECK_BIN $PATH)

function __novadeck_prompt --on-event fish_prompt
    printf '\\e]7;file://%s%s\\e\\\\' $hostname (string escape --style=url -- $PWD)
end
`

// PowerShell loads the user's profile before -Command runs this. The prompt reports
// the directory with OSC 9;9, as Windows Terminal documents, around the user's own.
const powershell = `${header("#", "shell integration for PowerShell")}
# Your profile may put other directories first; the agent shims go back in front.
$__NovaDeckSeparator = [IO.Path]::PathSeparator
if (-not $env:PATH.StartsWith("$env:NOVADECK_BIN$__NovaDeckSeparator")) {
  $env:PATH = "$env:NOVADECK_BIN$__NovaDeckSeparator$env:PATH"
}
$global:__NovaDeckPrompt = $function:prompt
function global:prompt {
  $prompt = & $global:__NovaDeckPrompt
  $location = $executionContext.SessionState.Path.CurrentLocation
  if ($location.Provider.Name -ne 'FileSystem') { return $prompt }
  "$([char]27)]9;9;\`"$($location.ProviderPath)\`"$([char]27)\\$prompt"
}
`

const posixShim = (program: string, inject: string): string => `#!/bin/sh
${header("#", `shim for ${program}`)}
# Runs the real ${program}, adding a per-run hook that tells NovaDeck which session runs
# in this terminal. Nested runs, and runs outside NovaDeck's terminals, go unchanged.
novadeck_real=
novadeck_ifs=$IFS
IFS=:
set -f
for novadeck_dir in $PATH; do
  [ -n "$novadeck_dir" ] || continue
  novadeck_candidate=$novadeck_dir/${program}
  if [ -f "$novadeck_candidate" ] && [ -x "$novadeck_candidate" ] && ! [ "$novadeck_candidate" -ef "$0" ]; then
    novadeck_real=$novadeck_candidate
    break
  fi
done
set +f
IFS=$novadeck_ifs
if [ -z "$novadeck_real" ]; then
  echo "${program}: command not found" >&2
  exit 127
fi
if [ -n "\${NOVADECK_AGENT:-}" ] || [ -z "\${NOVADECK_TERMINAL_ID:-}" ]; then
  exec "$novadeck_real" "$@"
fi
NOVADECK_AGENT=${program}
export NOVADECK_AGENT
exec "$novadeck_real" ${inject} "$@"
`

// `where` lists matches in PATH order, including this shim, and on npm installs an
// extensionless script that only other shells run; the first other runnable one wins.
const cmdShim = (program: string, inject: string): string => `@echo off
${header("rem", `shim for ${program}`)}
rem Runs the real ${program}, adding a per-run hook that tells NovaDeck which session runs
rem in this terminal. Nested runs, and runs outside NovaDeck's terminals, go unchanged.
setlocal
set "novadeck_real="
for /f "delims=" %%i in ('where ${program} 2^>nul') do call :consider "%%~fi"
if not defined novadeck_real (
  echo ${program}: command not found 1>&2
  exit /b 9009
)
if defined NOVADECK_AGENT goto plain
if not defined NOVADECK_TERMINAL_ID goto plain
set "NOVADECK_AGENT=${program}"
"%novadeck_real%" ${inject} %*
exit /b %ERRORLEVEL%
:plain
"%novadeck_real%" %*
exit /b %ERRORLEVEL%
:consider
if defined novadeck_real exit /b
if /i "%~dp1"=="%~dp0" exit /b
if /i "%~x1"==".exe" set "novadeck_real=%~1"
if /i "%~x1"==".cmd" set "novadeck_real=%~1"
if /i "%~x1"==".bat" set "novadeck_real=%~1"
if /i "%~x1"==".com" set "novadeck_real=%~1"
exit /b
`

/**
 * The hook command both agents run. Codex trusts a hook by a hash of its whole
 * definition, so the command must stay byte-identical across NovaDeck versions and
 * installs: it names the launcher through NOVADECK_HOOK, which NovaDeck's shells carry,
 * instead of a path. The agent's shell expands it: `$SHELL -lc` or `sh -c` elsewhere,
 * `cmd /C` for Codex and Git Bash for Claude Code on Windows.
 */
export const hookCommand = (agent: "claude" | "codex", platform = process.platform): string =>
  platform === "win32" && agent === "codex"
    ? `"%NOVADECK_HOOK%" ${agent}`
    : `"$NOVADECK_HOOK" ${agent}`

/** Codex's per-run SessionStart hook as a `-c` override; TOML literal strings hold it. */
export const codexHookOverride = (platform = process.platform): string =>
  `hooks.SessionStart=[{matcher='startup|resume|clear|compact',hooks=[{type='command',command='${hookCommand("codex", platform)}'}]}]`

const claudePlugin = {
  name: "novadeck",
  version: "1.0.0",
  description: "Tells NovaDeck which Claude Code session runs in its terminal. Loaded per run.",
}

const claudeHooks = (platform: NodeJS.Platform) => ({
  hooks: {
    SessionStart: [{ hooks: [{ type: "command", command: hookCommand("claude", platform) }] }],
  },
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
  const plugin = paths.claudePlugin
  const common = [
    file(paths.bash, bash),
    file(join(paths.zsh, ".zshenv"), zshStep(".zshenv")),
    file(join(paths.zsh, ".zprofile"), zshStep(".zprofile")),
    file(join(paths.zsh, ".zshrc"), zshrc),
    file(paths.fish, fish),
    file(paths.powershell, powershell),
    file(
      join(plugin, ".claude-plugin", "plugin.json"),
      `${JSON.stringify(claudePlugin, null, 2)}\n`,
    ),
    file(
      join(plugin, "hooks", "hooks.json"),
      `${JSON.stringify(claudeHooks(platform), null, 2)}\n`,
    ),
    file(paths.hookScript, hookScript),
  ]
  const claude = `--plugin-dir ${platform === "win32" ? cmdQuote(plugin) : shQuote(plugin)}`
  const override = codexHookOverride(platform)
  if (platform === "win32")
    return [
      ...common,
      file(paths.hook, cmdLauncher(runtime, paths)),
      file(join(paths.bin, "claude.cmd"), cmdShim("claude", claude)),
      // cmd reads each double quote as a toggle, so the | in the matcher stays quoted
      // while \" hands Codex's argument parser a literal quote.
      file(
        join(paths.bin, "codex.cmd"),
        cmdShim("codex", `-c "${override.replaceAll('"', '\\"').replaceAll("%", "%%")}"`),
      ),
    ]
  return [
    ...common,
    file(paths.hook, posixLauncher(runtime, paths), 0o700),
    file(join(paths.bin, "claude"), posixShim("claude", claude), 0o700),
    file(join(paths.bin, "codex"), posixShim("codex", `-c ${shQuote(override)}`), 0o700),
  ]
}
