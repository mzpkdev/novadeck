# Targeted flake capture

Capture the remaining Grid undocking and Antigravity Stop-boundary failures with their
original inputs and test deadlines. These probes collect evidence; passing samples do
not establish a repair.

The `Flaky capture` workflow runs when a pull request changes these diagnostic scripts,
its workflow, or the opt-in Antigravity probe/config. It checks out the exact PR head
SHA with read-only repository permissions. Grid runs on macOS and Windows; Antigravity
runs on Linux. Each job uploads its capture directory even when a test fails. The first
failed process stops that job's sequence and returns a nonzero exit status.

## Grid

With Node 26, the locked dependencies, the protocol build and Chromium installed, run
from the repository root. Use a new output directory outside the checkout:

```sh
pnpm --filter @novadeck/protocol build
pnpm --filter @novadeck/ui exec playwright install --with-deps chromium
node scripts/flaky-capture/grid.ts --output /path/to/grid-capture --attempts 5
```

Each attempt starts a fresh Vitest process and runs the complete, unchanged
`companions.spec.tsx`: all 30 cases, including the predecessors of the ordinary
12-move and separate one-move Grid undocking cases. The existing 30-second case
deadlines and assertions are inherited from the UI config. There is no added delay,
repeated gesture within a case, app mock or forced scheduling condition.

`--attempts` accepts 1–5 and defaults to 5. A child-process watchdog stops infrastructure
hangs after five minutes; the total capture budget is 15 minutes, excluding dependency
setup. Either limit may end collection before five attempts and is reported as a timeout,
not a reproduced Grid failure. The workflow gives capture 17 minutes within a 25-minute
job so artifacts have time to upload.

A successful attempt requires finalized Vitest JSON reporting all 30 original cases
passed, 30 per-case records, and native release plus app-drop observations for both Grid
variants. Empty, skipped or incomplete collection cannot report success. If the original
file changes, review and update this explicit completeness contract.

The output contains:

- `identity.json`: actual/expected checkout SHA, Node/Vitest/Playwright versions and
  relevant source hashes. Each attempt also records its Chromium version and viewport.
- `summary.json`: requested/completed attempts and their process/capture outcomes.
- `attempt-NN/process.log`, `process.json` and `tests.json`: complete process output,
  exit/signal/timeout information and finalized test outcomes.
- `attempt-NN/case-NN.json`: native pointer/capture events and app drop state for every
  case, including successful controls. Buffers retain the last 200 events and state
  total/dropped counts explicitly. They contain coordinates, scalar pointer properties,
  non-text DOM hit/target summaries, sortable indexes and before/after drop state.
  Free-space drags also retain their planned point, view/window rectangles and viewport,
  with the view rectangle measured again at native release.
- `attempt-NN/attachments/` and `traces/`: failed screenshots and Playwright traces.
  These use visible directory names so the workflow need not upload unrelated hidden files.

A nonzero test process may be an unrelated companion assertion or an infrastructure
failure. Inspect the finalized outcomes and event sequence before calling it a Grid
reproduction. Trace collection and passive event observation can affect timing; a passing
capture does not rule out the original failure.

## Antigravity

The Linux probe requires the pinned Antigravity 1.2.14 binary, protocol/relay builds and
the existing loopback-only network namespace wrapper:

```sh
export NOVADECK_E2E_AGENTS=agy
export NOVADECK_E2E_HARNESS=pinned
export NOVADECK_E2E_CACHE=/path/to/harness-cache
pnpm --filter @novadeck/protocol --filter @novadeck/relay build
node scripts/e2e/install/main.ts
node scripts/flaky-capture/agy.ts --output /path/to/agy-capture --attempts 5
```

Each fresh process preserves the original natural order: send First quick and Second
quick; wait for Did second; send Third one and Fourth one concurrently; wait for Did
fourth; send the multiline Five prompt, then Then one immediately; wait for the original
replies and assert each original user prompt occurred once. It adds no Stop gate, held
reply, resend, settling wait or timeout increase. The original 30-second reply waits and
180-second case ceiling remain.

The launcher allows at most five attempts and stops on the first nonzero process or
non-delivered outcome. Each attempt retains its identity/binary hash, native PTY output,
input and hook/model events, final screen, delivery/binding state, transcript/history and
log. A visible `hooks.txt` copy preserves the fixture's hidden trace for artifact upload.
The probe redacts the fixture credentials and reports bounded-buffer overflow. Its
summary distinguishes a submitted follow-up that never reached the model from other
scenario failures; either result still needs investigation before choosing a repair.

Artifacts remain for seven days. Keep successful controls and the first failure together
when archiving them, with the actual checked-out SHA rather than only the PR merge ref.

## Follow-up native captures

The `Flaky hunt 3` workflow adds macOS uninstall evidence, a Linux Antigravity experiment
and a Windows Antigravity approval capture. It runs on pull requests changing its
workflow, these collectors or the Antigravity probes/config. All jobs check out and
verify the exact PR head, use read-only repository permissions, disable persisted
checkout credentials and always upload their
visible capture directories for seven days. The workflow uses no repository secrets and
publishes no release. Its jobs are separate from the original `Flaky capture` workflow;
any original Grid or natural Antigravity jobs that also run are additional controls,
outside the Linux experiment's six-process bound.

### macOS uninstall

Use the same Node 26, locked dependency, protocol and Chromium setup as Grid, on macOS:

```sh
node scripts/flaky-capture/uninstall.ts --output /path/to/uninstall-capture --attempts 3
```

The manual isolated mode starts a fresh Vitest process per attempt and runs all 11 original uninstall cases,
including the predecessors of the target assertion. The original 1,500 ms fixture
delay, 6,000 ms target poll and 30-second case deadlines stay unchanged. The collector
adds passive observations and tracing, with no forced delay or replay of a failed case.
It stops on the first nonzero process; at most three processes run.

The per-process watchdog is five minutes and the total collector budget is 15 minutes.
The original isolated mode uses the limits above; the dedicated broad Quality job described
below replaces its workflow invocation. Watchdog or incomplete collection results are infrastructure
evidence, not a reproduced uninstall assertion.

Retained files include checkout/tool/browser identity, process outcomes and logs,
finalized case results, per-case lifecycle observations, incoming and transformed source
hashes, and failure screenshots/traces. Successful controls remain beside the first
failure. Read the target observation together with its preceding cases; trace and event
collection can affect scheduling.

The opt-in transforms require exact source matches and observe confirmation, registration
and firing of the existing 1,500 ms timer, result receipt and the original poll reads.
Native events, DOM busy/error state and long tasks are observed passively. Each phase
records both its originating case and the case active when it was observed, so late
callbacks remain attributable. Normal UI, spec and fixture files stay unchanged; the
transforms and their hashes are retained under each attempt's `transforms/` directory.

### macOS uninstall under broad Quality load

The dedicated macOS job now runs one broad capture instead of repeating isolated controls:

```sh
node scripts/flaky-capture/uninstall.ts --scope quality --attempts 1 --output /path/to/uninstall-quality
```

Use ordinary macOS Quality setup: Node 26, locked dependencies, Rust/toolchain cache,
and Chromium. The launcher starts exactly `npm run test` from the repository root,
including repository tests and the original Turbo build/test graph with concurrency 1.
It does not prebuild the protocol or select files/projects. All three original UI
projects, setup, includes/excludes, browser settings and default file scheduling remain.
The 1,500 ms timer, 6,000 ms target poll and 30-second browser case ceiling stay unchanged.
An 18-minute process watchdog, 19-minute capture step and 25-minute job bound infrastructure;
there is one process and no scenario retry. Other Quality tests still run normally.

Only `uninstall.spec.tsx` receives the observer hooks, through a guarded opt-in import.
The shared fixture/component observations remain passive. Two explicit hashed Turbo
environment variables select capture and its new external output path; ordinary Quality
has neither. Fresh Vitest module-start observations establish actual execution of unit,
behaviour (including non-uninstall files) and motion projects. Replayed cache logs or a
loaded config alone cannot satisfy the capture validator. Whole-suite Playwright tracing
stays off to avoid its added scheduling load; normal failure screenshots remain enabled.

Alongside `identity.json` and `summary.json`, `attempt-01/` retains:

- `process.log` and `process.json`: root output (first 16 MiB, with explicit overflow),
  native exit/signal and watchdog outcome. Truncation cannot yield a successful capture.
- `tests.json`, `ui-config.json`, `ui-execution.json`: full UI results, original project
  selection/deadlines and bounded actual module execution (1,000 records, with overflow).
- `behaviour/uninstall/case-NN.json`, `source-events.json`, `browser.json`: the eleven
  original case timelines, final source flush, browser version and viewport. Case/source
  rings remain bounded at 1,000 events, and any overflow fails completeness.
- `transforms/{fixture,component,spec}.json` and `attachments/`: exact incoming/instrumented
  hashes and ordinary failure screenshots. No browser profile, environment dump or cache
  is uploaded.

The launcher reads available finalized results even when root tests fail. It distinguishes
an observed target assertion failure, another Quality failure, incomplete evidence and
infrastructure timeout/interruption. A failure remains nonzero; successful collection
requires the full root command to pass, the original eleven-case target evidence and
actual execution of all three UI projects. A passing broad run is another control, not
a product repair. Observation/reporting can affect scheduling, and cleanup of a killed
process group is best effort; the ephemeral job provides an outer lifetime bound.

### Linux staged Stop experiment

Use the Antigravity environment above. Build the runner and its dependency closure so a
fresh checkout has the protocol, relay and harness exports, then install the pinned binary:

```sh
pnpm --filter @novadeck/runner... build
node scripts/e2e/install/main.ts
node scripts/flaky-capture/agy.ts --output /path/to/agy-experiment --attempts 5 --experiment staged-stop
```

The launcher uses the existing loopback-only namespace and fake model, with no provider
credentials. This command has a fixed maximum of six fresh physical processes: one
natural-order control and five staged variants. There are two Enter attempts at the
Stop-handler return, two at the first post-Stop native frame showing both Did five and
Generating, and one control using the same staging after that frame clears.

The staged variants deliberately hold the fake model's Five reply while pre-pasting Then
and verifying it on two screen reads. They then send Enter at the selected boundary,
bypassing the original API's roughly 100 ms post-paste delay. These are experimental
perturbations; the natural control retains its original input order. No resend, process
signal, held EOF, harness-mode change or test-deadline increase is added. Original
30-second reply waits and the 180-second case ceiling still apply. The workflow bounds
the complete capture step at 22 minutes within a 30-minute job; those infrastructure
limits do not extend a reply or case deadline.

An invalid precondition consumes its fixed slot and records why; no replacement process
is launched. A target, scenario or infrastructure failure stops collection with exit 1.
If fixed slots finish but any precondition was invalid, exit 2 marks an inconclusive
experiment, which the workflow labels in its summary. That result is not a reproduced
product failure. Exit 0 requires all six slots to be valid and delivered. A failed or
inconclusive run needs evidence review before another collection is chosen.

Artifacts retain the fixed plan, per-process outcomes and invalidity reasons, native PTY
chunks and rendered frames, write-entry/return timing, HTTP finish/close events, hook
times, delivery/binding state, transcripts/history and visible hook traces. A returned
PTY write is an acknowledgment from the input API, not proof that the harness consumed
the key then. Compare the natural, busy-frame and cleared-frame controls before assigning
a cause; a staged failure alone does not establish the original natural failure's cause.

### Windows identical approvals

Run on Windows with Node 26, locked dependencies, PowerShell 7, Git for Windows and
symlink support, as on `windows-latest`. Use the pinned Antigravity environment above:

```sh
pnpm --filter @novadeck/runner... build
node scripts/e2e/install/main.ts
node scripts/flaky-capture/agy-approval.ts --output /path/to/windows-agy-approval
```

This command launches one fresh process with pinned Antigravity 1.2.14. It selects the
original `answers.e2e.ts` case that approves two identical queued commands from the chat
in turn and asserts each ran once. The original 60-second second-dialog wait and
180-second case ceiling remain. The process is not retried. A five-minute launcher
watchdog, eight-minute capture step and 25-minute workflow job bound infrastructure
hangs without extending either test deadline.

The original Windows E2E fixture supplies its sandbox, fake model/key, refusing proxy,
credential/home tripwires and process teardown. It refuses to start while Windows
Credential Manager holds the person's Antigravity login; the collector does not read or
remove that secret. Windows has no Linux network namespace. Its proxy blocks requests
from programs that honor it; direct connections that bypass the proxy are neither
blocked nor recorded by that mechanism. The workflow supplies no provider credentials.

The opt-in transform checks the original scenario body hash and exact instrumentation
boundaries. It retains the original case and records both incoming and transformed
source hashes. The visible output directory contains:

- `identity.json`, `harness.json` and `transforms/{hook,case}.json`: checkout, tool,
  pinned-binary and source identities.
- `events.jsonl`: raw-ingress, size-pruned payload and decoder observations, including
  the presence, type and safe value of `tool_confirmation_pending`, payload sizes,
  session/step metadata, tool/input hashes, decoded facts and pending request sets.
  Distinct `PreToolUse` sequence numbers preserve the two source occurrences even when
  their command hashes match. A decoded occurrence does not prove that its report was
  accepted for the bound session; compare report-return and binding/request state.
  The timeline also records native rendered frames, explicit answer calls and PTY
  write-entry/return acknowledgments. A returned write does not prove that the CLI
  consumed the key at that time.
- `native-output.jsonl`, `final.json`, `history.json`, `transcript.json` and `hooks.txt`:
  native PTY chunks, final screen/binding/activity, conversation evidence and visible
  hook traces. The opt-in event observations finish before the fixture's teardown;
  the fixture still performs its normal cleanup and tripwire checks.
- `tests.json`, `process.log`, `process.json` and `summary.json`: original case results,
  process/watchdog outcome, completeness and bounded-buffer overflow information. A
  matching visible permission without a pending request is recorded separately from
  other scenario failures. With identical dialogs, that screen alone does not establish
  which occurrence remains visible.

Here, raw ingress means the relay payload received and parsed by the runner, before its
size pruning. It is not an observation of the CLI's stdin or an earlier relay boundary.
Unknown payload strings are hashed rather than copied into the metadata. Exit 0 requires
the original single case to pass, complete observations, two source tool occurrences and
two explicit answers. A nonzero result needs classification before it can be called an
approval reproduction. Instrumentation can affect timing. This collects evidence; a
passing sample does not establish a repair.
