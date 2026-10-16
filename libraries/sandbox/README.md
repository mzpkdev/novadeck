# @novadeck/sandbox

An isolated environment for tests and benchmarks that run real shells and programs, so a
program under test can't reach the developer's configuration, logins or keyring, and nothing it
started outlives the run. Node only.

## Subpaths

- `.`: `createSandbox(options)` makes a throwaway root with a home and a project, and an
  environment made only of what the sandbox sets: HOME and the XDG folders inside it, a PATH of
  the programs under test, Node through a folder of its own and the system's folders, a dead
  D-Bus address, and the proxy when given. On Windows the user's folders (USERPROFILE, APPDATA,
  LOCALAPPDATA, TEMP) move inside it too, and git and PowerShell 7 come by their own installs.
  `gitBash()` finds Git for Windows' bash. The caller removes `root`.
- `./reap`: `reap(sandbox)` ends what still runs in the sandbox (started since it was made,
  working inside it or with its home), asking first, then forcibly, and returns what had to be
  ended. Linux reads `/proc`, macOS asks `ps` and `lsof`, Windows compiles a small process lister
  with the C# compiler every Windows has. On Windows a forcible end goes through the `trees`
  option, a reader that ends each process only as the one it read; without it, taskkill.
- `./tripwire`: `tripwire(sandbox, watches)` notes paths in the developer's real home before a
  run and returns, after it, those a program that escaped the sandbox wrote to.

## What it doesn't cover

- **Stores outside the environment.** The macOS Keychain and defaults and the Windows registry
  are the user's whatever the environment says; a program that keeps its login there needs a
  guard of the caller's own.
- **The network.** The proxy only reaches programs that honour it. On Linux, run the whole job in
  a network namespace whose only interface is loopback: `node scripts/e2e/isolated/main.ts --
  <command>`.
