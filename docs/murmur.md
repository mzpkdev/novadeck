# Murmur

Murmur is an opt-in local model that writes terminal titles. (Summaries are the agents' own, written with their `summarize` tool; murmur reads them as the strongest input to a title.) It runs
Qwen3.5-2B (Q4_K_M, 1.28 GB) on llama.cpp's `llama-server`, an engine of its own like
voice input's, installed from Preferences > Addons. Without it, terminals keep their default
titles.

Code: `application/runner/src/murmur`, the engine build in `application/murmur`.

## What it reads

Terminals ask for a description when something worth a new one happened (see
`terminals/murmur.ts`) and hand over a digest:

- an agent terminal: the harness, project, folder, branch, plan, its busiest folders, the
  person's prompts (the last one is the current one), the tail of the agent's last reply, the
  agent's own summary when it has written one, and murmur's previous title;
- a plain shell: project, folder, the foreground command, the visible screen rows and the
  previous title.

Nothing else is read, and nothing leaves the machine: the server listens on `127.0.0.1`
behind a random API key made for each launch and passed in the environment
(`LLAMA_API_KEY`).

## Guardrails

- **Redaction** (`redact.ts`): fixed rules strip secrets from every digest string before the
  model sees it, by shape alone. They cover provider keys and tokens (`sk-`, `sk_live_`,
  `ghp_`, `github_pat_`, `glpat-`, `hf_`, `hvs.`, `npm_`, `pypi-`, `AIza`, `AKIA`, `xox`,
  `AGE-SECRET-KEY-`), JWTs, `Authorization`, `Cookie` and bearer values, webhook URLs, URLs with
  `user:password@` (also with an empty user) and secret query parameters, key blocks,
  `NAME=value`, `name: value` and `"name": "value"` when the name sounds secret, exact
  secret flags (`--password`, `--token`, `--api-key`, ...), `mysql -p`, `docker login -p`
  and `curl -u`, and long hex or base64 runs.
  - A name sounds secret by its words: `secret`, `password`, `token`, `pass`, `pwd`, an `api`,
    `private` or `access` before `key`, and so on. `KEY_COUNT`, `token_count`,
    `PRIMARY_KEY`, `auth=required`, `sessionId` and `--sort-key` are not secrets. Values that are
    paths, short numbers or words like `true` are kept.
  - Base64 never matches inside a path, and needs digits, mixed case and no long word, so
    identifiers and paths survive. Commit ids (40 hex) and `sha256:` digests are kept.
  - A terminal wraps long lines, so a token split across rows is still found; the row after a
    wrapped token may be removed with it.
  - The length caps apply after redaction, in the prompt, so a cut token's prefix can't leak.
    Permission commands are never in a digest.
- **Validation** (`description.ts`): the reply must be JSON with a title of 2 to 6 words and
  at most 48 characters. Anything else is dropped.
- **Stability**: the previous title goes in the prompt, with the instruction to keep it
  unless the work clearly changed.
- **Prompt** (`prompt.ts`): the current prompt comes last and is labelled. The size is
  capped to fit the 4096-token window.

## Device policy

Murmur needs a GPU; there is no CPU mode. `llama-server --list-devices` prints each device
with its kind (`igpu`, `gpu`, `cpu`, `accel`; Novadeck's patch adds the kind). Candidates are
integrated GPUs first, then dedicated ones, never the CPU, picked by kind and never by index.

The install check runs a fixed test description on each candidate in that order and keeps
the first that returns a valid one. The result (`device` name, `integrated`, `milliseconds`)
is saved. Launches find that device again by name, as indexes differ between boots. When no
candidate works the install fails saying murmur needs a working GPU, and murmur stays off.

## The card's state

Installed with no passed check (a cancelled check, or a restart after a failed one) is shown as
`installed: true, check: null` with `failure` set to a message ending in "Try again." Install
again runs just the check. `failure` is also set for a failed install or engine update, and
clears on the next one.

## Being polite

- It loads on the first job and unloads after about two minutes idle.
- One job at a time. A job whose signal aborts is dropped.
- Voice input has priority: while `voice.activity.busy()`, murmur aborts its request, waits,
  and retries.
- Jobs wait while the computer's free memory, or the chosen device's, is under about 2 GB. macOS
  counts only never-used pages as free, so there only the device's own figure (Metal's working
  set) is used.
- A request that gets no answer in a minute counts as a failure and the engine is restarted.
- After a failed job, or when the checked GPU can no longer be found, murmur refuses jobs for 30 seconds, doubling with each failure in a
  row up to eight minutes.
- It runs on battery.

## Configuration

- `NOVADECK_MURMUR_ENGINE`: the engine's manifest (`engine.json`).
- `NOVADECK_MURMUR_SOURCE`: where its archive is, an https URL ending in `/` or a folder.
- The engine and model install in `<database folder>/murmur`.

The desktop app passes `--novadeck-murmur-engine=` and `--novadeck-murmur-source=` to the
runner; packaged, the manifest is at `resources/murmur/engine.json`.

## Testing

`testing/fake-llama.mjs` stands in for `llama-server`; the model file's contents steer it
(`fail:<device>`, `crash`, `slow`, `garbage`, `late`, `log`). `murmur/real.test.ts` runs
the real engine when `NOVADECK_MURMUR_REAL_ENGINE` (an unpacked engine folder) and
`NOVADECK_MURMUR_REAL_MODEL` are set. The prompt was tuned against the real model with
`tasks/murmur/prompt-eval` (title-only jobs take 2 to 6 s warm on an Arc iGPU, about half of the
title-and-summary jobs).
