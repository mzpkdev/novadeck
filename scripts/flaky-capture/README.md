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

The `Flaky hunt 3` workflow adds macOS uninstall evidence and a Linux Antigravity
experiment. It runs on pull requests changing its workflow, these collectors or the
Antigravity probe/config. Both jobs check out and verify the exact PR head, use read-only
repository permissions, disable persisted checkout credentials and always upload their
visible capture directories for seven days. The workflow uses no repository secrets and
publishes no release. Its jobs are separate from the original `Flaky capture` workflow;
any original Grid or natural Antigravity jobs that also run are additional controls,
outside the experiment's six-process bound.

### macOS uninstall

Use the same Node 26, locked dependency, protocol and Chromium setup as Grid, on macOS:

```sh
node scripts/flaky-capture/uninstall.ts --output /path/to/uninstall-capture --attempts 3
```

Each attempt starts a fresh Vitest process and runs all 11 original uninstall cases,
including the predecessors of the target assertion. The original 1,500 ms fixture
delay, 6,000 ms target poll and 30-second case deadlines stay unchanged. The collector
adds passive observations and tracing, with no forced delay or replay of a failed case.
It stops on the first nonzero process; at most three processes run.

The per-process watchdog is five minutes and the total collector budget is 15 minutes.
The workflow allows 17 minutes for capture within a 25-minute job so setup and artifact
upload have headroom. Watchdog or incomplete collection results are infrastructure
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
