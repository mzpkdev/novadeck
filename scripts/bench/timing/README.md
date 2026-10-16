# The timing run

The benchmark's timing run (rule 16): the UI's production build in headless Chromium against
a real runner over WebSocket, as the dev-web path wires them, with fake agents that send real
hooks and status-line telemetry. Its numbers are a trend, too noisy to gate on: it writes a
report and always exits 0.

```sh
pnpm bench:timing [--output <file>]
```

It builds the runner and the sandbox library (turbo), then:

1. makes a sandbox (`@novadeck/sandbox`): a throwaway home holding a `.claude/settings.json`
   with Novadeck's plugin on, so the runner counts Claude Code connected, and a PATH whose only
   `claude` is the fake (`agent.ts`); it refuses to start if any other folder on that PATH holds
   `claude`, `codex` or `agy`;
2. builds the UI with the runner's address and token baked in, and serves it with `vite preview`;
3. starts the runner from its build with the sandbox's environment alone;
4. drives Chromium through the scenario (`drive.ts`): 13 terminals, the first 5 running the fake
   agent and the rest idle shells; Grid, then Focus, a steady window in each with every agent
   busy (5 s warm-up, 15 s measured); then 2 passes of 10 switches in Focus;
5. stops it all, reaps whatever still runs in the sandbox and checks the developer's home with
   the tripwire.

The report goes to `.cache/bench/timing.json` unless `--output` says otherwise. On Linux it can
run with no network at all, inside the e2e suite's namespace:
`node scripts/e2e/isolated/main.ts -- pnpm bench:timing`. Linux and macOS only.

## The report

Its shape, with illustrative numbers:

```jsonc
{
  "version": 1,
  "startedAt": "…", "finishedAt": "…", "commit": "<sha>",
  "environment": { "platform": "linux", "cpus": 4, "cpu": "…", "chromium": "…", … },
  "scenario": { "terminals": 13, "agents": 5, "warmMs": 5000, "windowMs": 15000, … },
  "summary": {
    "switchP50Ms": 31.2,      // click to the target's screen painted, null if none painted
    "switchP90Ms": 35.0,
    "switchesTimedOut": 0,    // switches that never painted within 4 s
    "agentsHeard": 5,         // agents whose hooks the runner heard: below 5, the run measured less load
    "steady": [
      // per layout: the main thread's busy share (%), frames a second, frame gaps over
      // 33 ms and long tasks, over the window
      { "layout": "Grid", "mainThreadShare": 61.3, "fps": 44.1, "framesOver33ms": 87, "longTasks": 40 },
      { "layout": "Focus", "mainThreadShare": 22.0, "fps": 59.8, "framesOver33ms": 3, "longTasks": 2 }
    ]
  },
  "samples": { "agentPhases": ["running", …], "steady": [ … frame gaps and long tasks … ], "switches": [ { "target": 1, "ms": 30.4 }, … ] },
  "problems": [],             // processes reaped after the run, the developer's home written to
  "error": "…"                // only when the run stopped short; the summary covers what it got
}
```

`problems` should always be empty: anything there means the sandbox leaked. `mainThreadShare`
is Chromium's TaskDuration over wall time, which can pass 100 when the main thread is saturated
and other threads' tasks count too. On a shared machine the numbers move run to run; compare
runs from the same machine, as the CI gate keeps them.
