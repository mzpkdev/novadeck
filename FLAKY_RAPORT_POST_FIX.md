# CI flake investigation after repairs

This is a fresh sample after the repairs in [the previous report](FLAKY_RAPORT.md)
and a rebase onto main `9c88b133d7cc509dcdee6e54e77008dcb696bad0`.
The previous opening round, 30 reruns and repair validation remain separate.

Pending: opening runs and their exact identities. Completed reruns: **0 / 30**.

## Method

Record the opening round separately, then rerun the complete Quality, PR and E2E
workflows 30 times, including jobs that passed. Keep the sampled head fixed after
the opening push. Do not repair code, change diagnostics, update the PR description
or enable Actions debug logging during the sample. Report updates remain local
until the 30 rounds finish; publishing them earlier would change the sampled head.

Quality covers static checks, Linux/macOS/Windows tests, the production build and
the visitor build/posters. PR covers description and workflow verification. E2E
covers pinned Claude Code, Codex and Antigravity on Linux, macOS and Windows,
the Mixed scenarios and all three Windows quirks jobs. Release, deployment and
Dependabot workflows are outside this sample and are not rerun.

Poll at a fixed 180-second interval. Before starting another round, save each
workflow attempt's metadata, complete job logs and available failure artifacts
under the task's `evidence-postfix-30/` directory outside the public repository.
Record the commit each job actually checked out: PR workflows can use a synthetic
merge commit, which differs from the branch head. Those exact checkout identities
must remain fixed across reruns. A later advance of main is recorded separately;
it does not change the sampled workflow events or authorize a mid-sample rebase.

A failed test or toolchain step is an observation and stays in the ledger even if
a later round passes. Preserve recovered setup failures too. A cancelled attempt,
missing expected job or unverified checkout is excluded and investigated before
sampling resumes. Exclusions do not count toward the 30 complete rounds.

## Run ledger

<!-- CI-LEDGER:START -->

| Round   | Quality | PR      | E2E     | Result                          |
| ------- | ------- | ------- | ------- | ------------------------------- |
| Opening | Pending | Pending | Pending | Not counted among the 30 reruns |

<!-- CI-LEDGER:END -->

## Observations

No completed sample yet. Add each observed failure with its round, workflow
attempt, job link, failing test or setup step, and retained log/trace location.
Separate the observed symptom from its proposed cause and any discriminating
reproduction. A passing rerun does not establish a fix.

Watch for recurrence of the previous unresolved Codex replacement-observation
gap, fixture startup and job-control failures, Windows render timeouts, motion
animations and the single-move undocking failure. Count only observations from
this sample here; older evidence remains in the previous report.

## Limits

Thirty workflow reruns measure this commit under these CI conditions. They do not
establish that every flake is gone or isolate code effects from cache state,
runner scheduling and infrastructure changes. Report workflow and job counts
with their denominators; keep the opening round and any excluded attempts apart.
