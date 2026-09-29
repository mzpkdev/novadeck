# Harness coverage

What Claude Code, Codex and Antigravity expose for each feature of the
[agent model](harness-adapters.md#agent-model), measured for step 3 of the
[harness adapters](harness-adapters.md#implementation-sequence) design. Levels use
`FeatureCoverage`: **complete** means both entering and leaving the state are
signaled, including failure and interruption; **partial** means some of it is;
**unsupported** means no usable native source exists.

Evidence:

- **Probed** means captured from a real run on 2026-09-29. Sanitized payloads are in
  `application/runner/src/harnesses/<id>/fixtures/`, and `fixtures.test.ts` checks
  the claims below that rest on them.
- **Documented** means the harness's own documentation, not yet seen in a run.

| Harness     | Version | How it was measured                                                                                                                                                                                                                 |
| ----------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | 2.1.285 | Probed: `claude -p` with every hook event registered through `--settings`. Documented: hooks, status line, agent view and monitoring references.                                                                                    |
| Codex       | 0.158.0 | Probed: `codex exec --json` and its rollout file; hooks in a throwaway `CODEX_HOME` holding only the probe's hooks, run with `--dangerously-bypass-hook-trust`. Documented: hooks reference, generated hook and app-server schemas. |
| Antigravity | 1.2.12  | Probed: `agy -p` in a scratch workspace whose `.agents/hooks.json` registered every event, and its `stream-json` output. Documented: the CLI's bundled `hooks.md`, the status line and title references, the CLI changelog.         |

## Matrix

| Feature     | Claude Code                                                                       | Codex                                                                               | Antigravity                                                                   |
| ----------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| session     | complete: `SessionStart` sources, `SessionEnd` reasons, `CLAUDE_PID` (probed)     | complete: `SessionStart` sources, `SessionEnd`, thread id, parent `codex` (probed)  | partial: `conversationId` on every hook, parent `agy` (probed); no end event  |
| activity    | partial: no signal for an Esc interrupt                                           | partial: `Interrupt` hook (documented); a failed turn fires nothing                 | partial: `PreInvocation`, `Stop` with `terminationReason` (probed)            |
| attention   | partial: `PermissionRequest` has no request id; a denial leaves no hook (probed)  | partial, documented: `PermissionRequest` has no id and no resolution                | partial: status line `tool_confirmation_pending` only                         |
| actors      | partial: `SubagentStart`/`SubagentStop` and `agent_id` on tool hooks (probed)     | partial: `SubagentStart`/`SubagentStop` and `agent_id` on tool hooks (probed)       | unsupported by hooks; parent id only in `conversation_summaries.db`           |
| transcripts | partial: session JSONL plus a file per subagent; undocumented records             | partial: rollout JSONL; items appear only when completed (probed)                   | partial: `transcriptPath` JSONL, rewritten on compaction; format undocumented |
| planning    | partial: `permission_mode: plan`; `ExitPlanMode` carries the plan and its file    | partial, documented: `permission_mode: plan`; `update_plan` tool                    | partial: status line `execution_mode`; `artifactDirectoryPath` on hooks       |
| usage       | partial: per-message usage in the transcript; cost only as a status line estimate | complete for tokens: `token_count` and `token_usage_record` (probed); no cost       | partial: status line token totals and cost estimate                           |
| limits      | partial: status line `rate_limits` only                                           | complete: `rate_limits` windows with reset instants in `token_count` (probed)       | partial: status line `quota` per model                                        |
| context     | partial: status line `context_window`; `PreCompact`/`PostCompact`                 | partial: `model_context_window` plus last response usage (probed); compaction hooks | partial: status line `context_window`; compaction has no signal               |

## Claude Code

**Hooks.** 33 events. In the probe:

- Every payload carries `session_id`, `transcript_path` and `cwd`.
- Every payload after the first prompt also carries `prompt_id`.
- Tool events carry `tool_use_id`.
- Events inside a subagent add `agent_id` and `agent_type`, and keep the root's `session_id`.
- Hooks run with `CLAUDE_PID`, `CLAUDE_CODE_SESSION_ID` and `CLAUDE_PROJECT_DIR` in their environment.

`CLAUDE_PID` names the Claude Code process, which is root-instance evidence for `same-root-instance`.

**Sessions.**

- `SessionStart.source` is `startup`, `resume`, `clear`, `compact` or `fork`.
- `clear` and `fork` mint a new session id.
- `SessionEnd.reason` is `clear`, `resume`, `logout`, `prompt_input_exit` or `other`.
- A crash or kill fires nothing, so the PTY exit remains the fallback.

**Activity.**

- `UserPromptSubmit` starts a turn.
- `Stop` ends it normally.
- `StopFailure` ends it on an API error. It carries `error` (`rate_limit`, `overloaded`, `billing_error`, …) and replaces `Stop`.
- An Esc interrupt fires no hook: the documentation says `Stop` does not run on a user interrupt. The transcript records `[Request interrupted by user…]` instead.
- `claude agents --json` reports `busy`, `waiting` or `idle` per session and is documented as the supported way to read state from outside. It is a polled command, not a stream.

In the probe, a background subagent's result began a second turn with its own `UserPromptSubmit` and `Stop`. So a turn does not always start with the person typing.

**Attention.**

- `PermissionRequest` fires as the prompt opens. It carries `tool_name`, `tool_input` and `permission_suggestions`, but no `tool_use_id` or request id.
- `PreToolUse` fires just before it with the `tool_use_id` (probed), so the request correlates with the preceding tool call.
- Approval shows as that call's `PostToolUse`.
- A denial by the person fires nothing (probed: no event followed); `PermissionDenied` covers auto mode only. The next tool, turn or session event is all that ends it.
- Questions are the `AskUserQuestion` tool, visible through `PreToolUse` and `PostToolUse` with its `tool_use_id`. MCP elicitations have `Elicitation` and `ElicitationResult` with an `elicitation_id`.
- `PermissionRequest`, `Elicitation` and `PreToolUse` can answer: a later `respond`/`answer` capability has a native path.

**Actors.**

- `SubagentStart` and `SubagentStop` carry `agent_id` and `agent_type`, and `SubagentStop` adds `agent_transcript_path`.
- The parent's `Agent` tool call links to the child through `subagents/agent-<id>.meta.json` (`toolUseId`), an undocumented file.
- Internal agents (prompt suggestions, `/btw`) also fire `SubagentStart`/`SubagentStop`; filter them by `agent_type`.
- Subagent failure or interruption has no distinct signal.

**Transcripts.**

- Location: `~/.claude/projects/<cwd slug>/<session>.jsonl`, plus `subagents/agent-<id>.jsonl`.
- Records chain by `uuid`/`parentUuid`, and tool calls link by `tool_use_id`.
- Record types beyond `user`, `assistant` and `system` are internal and change between versions.
- The file is written asynchronously and may lag the hooks.

**Planning.**

- Hooks carry `permission_mode`; `plan` means planning mode. No hook fires on the mode change itself; the status line reruns on it.
- `ExitPlanMode` is a tool whose `PreToolUse` input carries `plan` (Markdown) and `planFilePath`, and whose `PostToolUse` means it was approved.
- A rejected plan has no documented signal.

**Usage, limits, context.**

- **Transcript:** `assistant.message.usage` has input, output and cache counts. Several records can belong to one API response, so deduplicate by `requestId`.
- **Status line:** the JSON on stdin has
  - `cost.total_cost_usd` (a client-side estimate),
  - `context_window` (size, `used_percentage`, current usage),
  - `rate_limits.five_hour` and `rate_limits.seven_day`, each with `used_percentage` (0–100) and `resets_at` (epoch seconds).
- `rate_limits` appears only for subscription accounts, and only after the first response. A missing window is unknown, not zero.
- No other source carries rate limits.

## Codex

**Hooks.** 12 events: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SubagentStart`, `SubagentStop`, `Stop` and `Interrupt`.

- Every payload carries `session_id`, `cwd`, `transcript_path` (the rollout), `model` and `permission_mode`.
- Turn-scoped events carry `turn_id`.
- Tool events carry `tool_use_id`, except `PermissionRequest`.
- Hooks run as direct children of the `codex` process (probed), so the hook's parent process identifies the Codex instance.
- The hook's environment has `CODEX_HOME` but no thread id (probed).
- A spawned subagent's `SubagentStart` and tool events carry its `agent_id` and its own `turn_id`, under the root's `session_id` (probed). Spawning shows as the tool `collaborationspawn_agent`.
- A plugin's hooks stay inert until the person reviews and trusts them in `/hooks`. Trust is kept against the hook definition's hash, and no hook announces the missing trust. The app-server's `hooks/list` reports it.

**Sessions.**

- `SessionStart.source` is `startup`, `resume`, `clear`, `compact` or `fork`.
- `SessionEnd` fires on a normal end only.
- The thread id from `codex exec --json`, the rollout file name and `session_meta.id`/`session_id` are the same value, and the hook's `session_id` is that id (probed).
- `CODEX_THREAD_ID` reaches commands Codex runs, not the TUI.

**Activity.**

- `UserPromptSubmit` starts a user turn; the rollout's `task_started` covers every turn.
- `Stop` ends a turn, and `Interrupt` marks a user interrupt (rollout: `turn_aborted` with `reason`).
- A failed turn (usage limit, context exceeded) fires no hook and leaves no rollout record, so activity becomes unknown there.

**Attention.**

- `PermissionRequest` carries `tool_name` and `tool_input` but no id, and nothing reports its resolution. Correlate it with the preceding `PreToolUse`, the same as for Claude Code.
- Approvals are not written to the rollout.
- `request_user_input` is a function tool, and whether it reaches `PreToolUse` needs a probe.
- `PermissionRequest` can answer `allow` or `deny`.

**Actors.**

- `SubagentStart` and `SubagentStop` carry `agent_id` and `agent_type`, and `SubagentStop` adds `agent_transcript_path`.
- Each subagent has its own rollout whose `session_meta.source.subagent.thread_spawn` names the parent thread.
- Internal threads (`review`, `compact`, `guardian`, `memory_consolidation`) are not the person's agents.

**Transcripts.** The rollout is JSONL at `~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<thread>.jsonl`.

- Records are `session_meta`, `turn_context`, `event_msg` (`task_started`, `item_completed`, `token_count`, `task_complete`, `turn_aborted`, `context_compacted`, …), `response_item`, `token_usage_record`, `world_state` and `compacted`.
- Items appear only once completed (probed), so a running command is visible only through `PreToolUse`.
- The format is undocumented and changed recently (`history_mode`, `migrate-rollouts`).

**Planning.** Hooks carry `permission_mode: plan`. Plans are the `update_plan` tool, visible through `PreToolUse` and `PostToolUse`.

**Usage, limits, context.** The rollout's `token_count` holds:

- `info.total_token_usage` (cumulative for the thread) and `info.last_token_usage` (the latest response): input, cached, cache write, output, reasoning and total tokens.
- `info.model_context_window`.
- `rate_limits.primary` and `rate_limits.secondary`, each with `used_percent` (0–100, probed at `37.0`), `window_minutes` and `resets_at` (epoch seconds, probed). `secondary` can be null.

Other facts:

- `token_usage_record` gives usage per response and per turn.
- No source reports a cost.
- Occupancy is estimated from the last response's input tokens over `model_context_window`.

## Antigravity

**Hooks.** Five events: `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation` and `Stop`.

- Every payload carries `conversationId`, `workspacePaths`, `transcriptPath`, `artifactDirectoryPath` and `modelName`.
- `PreToolUse` can allow, deny or ask; `PostInvocation` and `Stop` can force the loop to continue.
- Hooks run through `sh`, whose parent is the `agy` process (probed), so the hook's grandparent identifies the Antigravity instance.
- The hook's environment has `ANTIGRAVITY_CONVERSATION_ID` (probed). It also inherits every ancestor's variables: probed under Claude Code, it carried `CLAUDE_PID`. An environment variable therefore never proves which harness sent a report.
- Workspace hooks in `.agents/hooks.json` ran in print mode without a trust prompt (probed).

**Sessions.**

- `/clear`, `/resume` and `/fork` switch conversations inside one process. The only sign is a new `conversationId` on the next hook.
- Nothing marks the end of a session.

**Activity.**

- `PreInvocation` fires before each model call; `PostInvocation` fires after it.
- `Stop` ends the execution loop with `terminationReason`, `error` and `fullyIdle` (false while background tasks run). The probe saw `NO_TOOL_CALL`, where the documentation lists `model_stop`, `max_steps_exceeded` and `error`, so decoders must accept values beyond those.
- A tool that failed or was denied fires `PreToolUse` but no `PostToolUse` (probed: print mode denied every tool); `stream-json` marks it `ERROR`.
- Whether a cancellation fires `Stop` is unknown.

**Attention.**

- There is no permission or question hook.
- The status line's `tool_confirmation_pending` says a confirmation dialog is open, without saying which request.
- The `ask_question` tool probably shows as `PreToolUse`, pending a probe.

**Actors.** Subagents are separate conversations. Hooks do not say whether they fire for them. `conversation_summaries.db` records `parent_conversation_id` and `nesting_depth`.

**Transcripts.** Every hook names the transcript, a JSONL file. It is rewritten on compaction, so following it must handle truncation. Its record format is undocumented.

**Planning.** Plan mode exists (`--mode plan`, `/plan`), and the status line reports `execution_mode`. Plans, task lists and walkthroughs are artifacts under `artifactDirectoryPath`. No signal marks a plan's approval.

**Usage, limits, context.** The status line only. Its JSON on stdin has:

- `agent_state` (`idle`, `thinking`, `working`, `tool_use`, `initializing`),
- `context_window` (size, used percentage, token totals),
- `quota` per model (`remaining_fraction`, `reset_time`, `reset_in_seconds`),
- `cost`, `task_count` and `pending_input_count`.

It also carries the account's `email`, which must not leave the adapter.

## Consequences for the design

1. **A status line bridge is the only route to some features.** It is the only live source for:
   - Claude Code's rate limits and context occupancy,
   - Antigravity's agent state, attention, usage, limits and context.

   A status line is a single user-level setting. For feature parity NovaDeck installs a bridge command that forwards to the person's own status line command, so their status line keeps working. For Claude Code, NovaDeck's shells can pass `--settings` at launch, as the Codex shim does for its flag, so the bridge applies only to NovaDeck's terminals. See [the design](harness-adapters.md#native-sources).

2. **Permissions have no request ids.** Claude Code and Codex requests correlate with the preceding `PreToolUse` `tool_use_id`. Their resolution is often inferred: a matching `PostToolUse` means allowed, and a later tool, turn or session event means resolved with an unknown outcome. `attention-resolved` needs an `unknown` outcome.
3. **Interruption is harness-specific.**
   - Codex has an `Interrupt` hook.
   - Claude Code has none; its transcript and `claude agents --json` show the interruption.
   - Antigravity is unknown.

   Without such a source, a turn stays `working` until the next event, and coverage says so.

4. **Every harness identifies its instance through the hook's process ancestry.**
   - Claude Code sets `CLAUDE_PID`.
   - A Codex hook's parent is `codex`.
   - An Antigravity hook's grandparent, through `sh`, is `agy`.

   The hook host should report the nearest ancestor whose executable is the harness, found through its `programs`. That gives `same-root-instance` evidence for all three, so Antigravity's `conversation-observed` switching can tighten. Linux was probed; macOS and Windows need their own process lookup. Inherited environment variables cannot stand in for it.

5. **Limits are percentages, not token counts.** Every harness reports windows as a used or remaining fraction with an absolute reset instant: Claude Code and Codex in epoch seconds, Antigravity as a time. None reports the limit itself, so the telemetry model stores fractions and never derives token amounts.
6. **Codex hook trust is a separate readiness state.** A connected Codex with untrusted hooks reports nothing. Detecting that needs the app-server's `hooks/list`, not a hook.

## Still to probe

- Claude Code: an Esc interrupt in an interactive session, a denied permission in a PTY session, `AskUserQuestion` answers in `PostToolUse`, and plan mode entry and `ExitPlanMode` rejection.
- Codex: a `PermissionRequest` (exec mode bypasses approvals), the `Interrupt`/`turn_aborted` pairing, `request_user_input`, and subagents under `--no-daemon`.
- Antigravity: conversation switches (`/clear`, `/resume`) inside one interactive process, `Stop` on cancellation, `ask_question`, subagent hooks, and the transcript and artifact formats.
- macOS and Windows: the hook's process ancestry.
