# CI flake investigation

Audit in progress. This report continues `ci-flake-hunt-2` after the fixes merged in
[PR #157](https://github.com/novadeck-org/novadeck/pull/157). No new CI results have
been classified yet.

## Method

Start from main commit `c9e73f1eabb6dbf5f00956138427b352b47df302`. Open a draft PR
with this report, then hold its code and report commit fixed during sampling.
Record the opening run separately, followed by **30 full reruns**. Each round
includes Quality (Linux, macOS and Windows tests plus static checks and build), PR
verification, and manually dispatched E2E against the pinned harness versions.
The E2E dispatch runs the complete matrix, including Windows quirks; a report-only
PR would otherwise skip it. Rerun whole workflows, including green jobs.

Poll every 180 seconds. Preserve each run ID, attempt number, head SHA, actual
checkout commit, job result, failed-job log and available failure artifacts before
starting the next attempt. Keep sampling independent of fixes. Update and push
the report after sampling so that a report change does not cancel or mix rounds.

A failure is an observation, not automatically a flake. Separate repeatable bugs,
intermittent test failures, environment/setup failures, cancellations and unknown
causes. A passing retry shows intermittence only when the relevant checkout is
unchanged. Correlated failures in one run are not independent observations. A
green aggregate without the expected matrix jobs does not count as a full round.

Raw evidence stays in the uberepo task's `evidence-30/` folder, outside the public
repository. GitHub run/job links and sanitized diagnostic excerpts belong here.
Historical evidence remains in that task's `evidence/` folder; the old handoff is
preserved as `ci-flake-hunt.note.yml`.

## Run ledger

Pending: opening runs and their exact identities. Completed reruns: **0 / 30**.

<!-- CI-LEDGER:START -->

| Round | Quality | PR  | E2E | Result |
| ----- | ------- | --- | --- | ------ |

<!-- CI-LEDGER:END -->

## Historical cases carried into this audit

These are observations from the task note, not new failures from this sample.
Their causes and current status are being checked against the retained evidence
and current main. Historical counts have different denominators and are not
included in the 30-rerun failure rate.

### H1: Dictation starts late or produces no transcript

- macOS Quality run [38491584016](https://github.com/novadeck-org/novadeck/actions/runs/38491584016), job 115617950482:
  `records while the shortcut is held and pastes the transcript into the terminal without sending it`
  waited 30 seconds for a transcript; the input stayed empty and the screenshot had no strip.
- Windows Quality run [38516615440](https://github.com/novadeck-org/novadeck/actions/runs/38516615440), job 115696742395:
  `keeps recording after a quick tap until the next press` never saw `Esc discard`.
- The earlier CPU-load probes passed 12/12 and 10/10; they did not establish a cause.
  Leads: capture startup still pending at release, fewer than 0.3 seconds of captured
  samples being silently discarded, or blur cancelling the recording.
- Diagnostic added previously: `Dictation, as it changed:` logs strip text, live
  microphone tracks, focus and visibility. Investigate retained logs and delay
  capture startup or stall the browser around release to discriminate those leads.
- Status: unresolved historical cause; investigation pending.

### H2: Codex long-prompt paste on Windows

- E2E run [38500197338](https://github.com/novadeck-org/novadeck/actions/runs/38500197338), job 115675831367:
  `gives its agent a long prompt that its box may show as a placeholder` failed
  with `PROMPT_FAILED: The prompt did not show in the agent's input box`.
- The paste had a five-second landing budget. The job took 913 seconds rather
  than its usual 500–600; load is a lead, not proof. The retained trace had no
  screen for this refusal. A diagnostic was added to record paste duration and
  the final box read. Check whether the paste never appeared or the read ran late.
- Status: unresolved historical cause; investigation pending.

### H3: Claude Code interruption leaves text in the box on Windows

- E2E run [38423918342](https://github.com/novadeck-org/novadeck/actions/runs/38423918342), job 115396144496, on PR #164;
  also observed on the Dependabot hono PR. The old note estimates about 2/40.
- `interrupts a running turn, which ends without a normal stop, and takes the next prompt`
  failed with `CONFLICT: input box holds text already` after interruption returned.
- Leads: Claude restored the interrupted prompt after the runner accepted an empty
  box, or the runner read a stale screen. The earlier double-Escape/Rewind-picker
  fix might share a cause, but the note does not show that. Added traces capture
  box reads, Escape, settling and the refusal screen.
- Status: unresolved historical cause; investigation pending.

### H4: Very early Codex Stop acts as idle Escape

- A raw-Escape test observed a Stop within roughly 10 milliseconds of prompt
  submission being read as idle Escape, followed by `esc again to edit previous message`.
- The hook can report working before Codex draws its running state. The old test
  now waits for the running screen. An agent or programmatic client can still
  reach this gap; the note names other scenarios that interrupt immediately after
  the hook but have not failed. The escape-race test may pass by calling it a won reply.
- Status: latent product race recorded previously; reproduction and present code need checking.

### H5: Plan-scroll restore ends before layout settles

- PR #157 extended restoration until time, frame and unchanged-layout conditions
  were met. The old note records a residual risk when a late zoom, fit or font load
  happens after restoration stops and a follower saves the wrong place.
- A calm macOS variant found the pane at the top in round 1 at `a689fc54`;
  leaking busy-test stalls were suspected but unproven. Those stalls now stop after each test.
- The old busy-load reproduction used 220 ms main-thread stalls every 260 ms;
  general CPU hogs had not reproduced the failure. A persistent layout listener
  was proposed, but not tested or shipped.
- Status: historical residual observation and hypothesis; investigation pending.

### H6: Assertions that can pass for the wrong reason

The note records these as weak checks, not confirmed flaky failures:

- `answers.e2e.ts` searches the whole screen for `qq`, which can appear in the random sandbox suffix.
- Windows sandbox-root stripping may miss forward-slash or JSON-escaped forms,
  allowing random `zz` in tool results to satisfy a screen assertion.
- `chat.e2e.ts` checks that `/clear` is absent from a whole screen.
- Claude's `clearPending` searches for `Esc again to clear` anywhere on screen.
- The effect of one Escape on a just-cleared Claude box was not empirically checked.
- The rewind guard includes `Nothing to rewind to yet`.

Status: inspect current assertions and distinguish false positives from failures.

### H7: pnpm setup registry timeout

A Windows Mixed job timed out fetching `@pnpm/win-x64` from npm. PR #157 added
a second setup attempt in PR, Quality and E2E. The old note says release and
Dependabot automerge still had one attempt. Record both recovered first-attempt
failures and terminal setup failures separately from test flakes.

## Previously fixed cases

The task preserved these fixes from merged PR #157 for context. They are not
claimed to have recurred in this sample:

- Antigravity's late session binding at `/clear` on Windows.
- Claude interruption retry sending a second Esc-Esc and opening Rewind on Windows.
- Plan-scroll restoration finishing too early on a busy page (with the H5 residual caveat).
- E2E leftover checks reporting an exited `agy.exe`.
- Test races around Codex Escape before its running screen, delivery state reads,
  `settleBox` on Windows, and random sandbox `zz` matching assertions.
- The pnpm setup retry described in H7.

## New findings and investigations

Pending. Each finding will name its round, OS, harness/test, exact failure,
evidence, demonstrated cause or remaining uncertainty, and next diagnostic when
the existing trace cannot explain it.
