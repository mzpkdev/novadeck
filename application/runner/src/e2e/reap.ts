import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { readdirSync, readFileSync, readlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

import type { Sandbox } from "./sandbox.js"

type Scope = Pick<Sandbox, "root" | "home" | "started">

/**
 * A process of the sandbox: its command's name, its start, which with its pid tells it
 * apart from a later process given the same pid, and whether it was stopped, as by job
 * control, when last read (never on Windows, which has no such state).
 */
type Process = {
  readonly pid: number
  readonly comm: string
  readonly start: number
  readonly stopped: boolean
}

/** How a platform finds the sandbox's processes, tells whether one still runs, and ends it. */
type Table = {
  /** The processes of the sandbox now. */
  readonly list: (scope: Scope) => Promise<readonly Process[]>
  /** Whether the process may still run, cheaply enough to ask again and again. */
  readonly alive: (scope: Scope, one: Process) => boolean
  /** Those of them still the same processes of the sandbox, as they are now. */
  readonly current: (scope: Scope, found: readonly Process[]) => Promise<readonly Process[]>
  /** Asks the process to end, or with `forcibly` ends it and, where it can, what it started. */
  readonly end: (one: Process, forcibly: boolean) => void
}

/**
 * The process with the pid, should it belong to the sandbox. It reads the process's
 * `stat` for its state and start, and passes over a zombie and any process that started
 * before the sandbox. Only for the rest does it read the target of `cwd`, then, should
 * that not be inside the sandbox, `environ`, searched only for `HOME=<sandbox home>`
 * and neither kept nor printed, and last its `comm`.
 */
const member = (sandbox: Scope, pid: number): Process | undefined => {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8")
    // Fields after the command, which is in parentheses and may hold anything: the state
    // is field 3, the start field 22.
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ")
    const start = Number(fields[19])
    if (fields[0] === "Z" || !(start >= sandbox.started)) return undefined
    const cwd = readlinkSync(`/proc/${pid}/cwd`)
    const inside = cwd === sandbox.root || cwd.startsWith(`${sandbox.root}/`)
    if (
      !inside &&
      !readFileSync(`/proc/${pid}/environ`, "latin1").split("\0").includes(`HOME=${sandbox.home}`)
    )
      return undefined
    return {
      pid,
      start,
      comm: readFileSync(`/proc/${pid}/comm`, "utf8").trim(),
      // T is stopped by a signal, t by a tracer.
      stopped: fields[0] === "T" || fields[0] === "t",
    }
  } catch {
    // Gone, or another user's, which a sandbox's process never is.
    return undefined
  }
}

// Linux, from /proc, signalling a process only should it still be the one found.
const linux: Table = {
  list: async (sandbox) =>
    readdirSync("/proc")
      .filter((name) => /^\d+$/.test(name) && Number(name) !== process.pid)
      .flatMap((name) => member(sandbox, Number(name)) ?? []),
  alive: (sandbox, one) => member(sandbox, one.pid)?.start === one.start,
  current: async (sandbox, found) =>
    found.flatMap((one) => {
      const now = member(sandbox, one.pid)
      return now?.start === one.start ? [now] : []
    }),
  end: (one, forcibly) => {
    try {
      process.kill(one.pid, forcibly ? "SIGKILL" : "SIGTERM")
    } catch {
      // Gone meanwhile.
    }
  },
}

// Reads another process's working folder and environment from its parameters, as Linux's
// /proc gives them, for a 64-bit Windows: the offsets are those of a 64-bit PEB and its
// RTL_USER_PROCESS_PARAMETERS. A process it may not read (another user's) gives null.
const peb = `
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class NovadeckPeb {
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr handle, IntPtr address, byte[] buffer, IntPtr size, out IntPtr read);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr handle, int kind, IntPtr[] info, int length, out int written);
  static byte[] Read(IntPtr handle, IntPtr address, int size) {
    var buffer = new byte[size];
    IntPtr read;
    return ReadProcessMemory(handle, address, buffer, (IntPtr)size, out read) ? buffer : null;
  }
  static IntPtr Pointer(IntPtr handle, IntPtr address) {
    var bytes = Read(handle, address, 8);
    return bytes == null ? IntPtr.Zero : (IntPtr)BitConverter.ToInt64(bytes, 0);
  }
  public static string[] Of(int pid) {
    IntPtr handle = OpenProcess(0x0410, false, pid);
    if (handle == IntPtr.Zero) return null;
    try {
      var info = new IntPtr[6];
      int written;
      if (NtQueryInformationProcess(handle, 0, info, IntPtr.Size * 6, out written) != 0) return null;
      IntPtr parameters = Pointer(handle, info[1] + 0x20);
      if (parameters == IntPtr.Zero) return null;
      string cwd = "";
      var folder = Read(handle, parameters + 0x38, 16);
      if (folder != null) {
        var name = Read(handle, (IntPtr)BitConverter.ToInt64(folder, 8), BitConverter.ToUInt16(folder, 0));
        if (name != null) cwd = Encoding.Unicode.GetString(name);
      }
      IntPtr block = Pointer(handle, parameters + 0x80);
      var sized = Read(handle, parameters + 0x3F0, 8);
      long size = sized == null ? 0 : BitConverter.ToInt64(sized, 0);
      if (size <= 0 || size > (1 << 20)) size = 32768;
      var environment = Read(handle, block, (int)size);
      return new[] { cwd, environment == null ? "" : Encoding.Unicode.GetString(environment) };
    } finally {
      CloseHandle(handle);
    }
  }
}
`

// The reader, compiled once into a folder of the system's temporary one, by its source.
const assembly = join(
  tmpdir(),
  `novadeck-e2e-peb-${createHash("sha256").update(peb).digest("hex").slice(0, 16)}.dll`,
)

const quoted = (text: string): string => `'${text.replaceAll("'", "''")}'`

// Lists, as JSON, the processes that started at or after the sandbox, other than this
// one and itself, whose working folder is inside the sandbox or whose HOME or USERPROFILE
// is its home: their pids, names and starts in milliseconds since the epoch. Only those
// whose parameters it may read count, as a sandbox's process always is this user's.
const listing = (sandbox: Scope): string => `
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath ${quoted(assembly)})) {
  Add-Type -TypeDefinition ${quoted(peb)} -OutputAssembly ${quoted(assembly)}
}
Add-Type -LiteralPath ${quoted(assembly)}
$root = ${quoted(sandbox.root)}
$sandboxHome = ${quoted(sandbox.home)}
$since = [DateTimeOffset]::FromUnixTimeMilliseconds(${sandbox.started}).UtcDateTime
$found = @([Diagnostics.Process]::GetProcesses() | ForEach-Object {
  if ($_.Id -eq $PID -or $_.Id -eq ${process.pid}) { return }
  # Another user's, or the system's, has no start this user may read.
  try { $created = $_.StartTime.ToUniversalTime() } catch { return }
  if ($created -lt $since) { return }
  $read = [NovadeckPeb]::Of($_.Id)
  if ($null -eq $read) { return }
  $cwd = $read[0].TrimEnd('\\')
  $inside = $cwd -ieq $root -or $cwd.StartsWith("$root\\", [StringComparison]::OrdinalIgnoreCase)
  if (-not $inside) {
    $own = $read[1].Split([char]0) | Where-Object { $_ -ieq "HOME=$sandboxHome" -or $_ -ieq "USERPROFILE=$sandboxHome" }
    if (-not $own) { return }
  }
  [pscustomobject]@{ pid = $_.Id; comm = "$($_.ProcessName).exe"; start = ([DateTimeOffset]$created).ToUnixTimeMilliseconds() }
})
ConvertTo-Json -Compress -InputObject $found
`

const listed = (output: string): readonly Process[] => {
  const text = output.trim()
  if (text === "") return []
  const parsed = JSON.parse(text) as unknown
  const rows = (Array.isArray(parsed) ? parsed : [parsed]) as {
    readonly pid: number
    readonly comm: string
    readonly start: number
  }[]
  return rows.map(({ pid, comm, start }) => ({ pid, comm, start, stopped: false }))
}

// Windows, through Windows PowerShell, which every Windows has: .NET's list of processes
// for their starts, never WMI, whose first queries on a fresh machine take many seconds,
// and the parameters of those started since the sandbox for their folders and environments.
const windowsList = async (sandbox: Scope): Promise<readonly Process[]> => {
  const root = process.env.SystemRoot ?? "C:\\Windows"
  const powershell = join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  const { stdout } = await promisify(execFile)(
    powershell,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      Buffer.from(listing(sandbox), "utf16le").toString("base64"),
    ],
    { windowsHide: true, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 },
  )
  return listed(stdout)
}

const windows: Table = {
  list: windowsList,
  // A pid alone, between listings: a process found a moment before isn't replaced by
  // another of the same pid that soon; `current` checks its start before it is ended.
  alive: (_sandbox, one) => {
    try {
      process.kill(one.pid, 0)
      return true
    } catch {
      return false
    }
  },
  current: async (sandbox, found) => {
    const now = await windowsList(sandbox)
    return found.filter((one) => now.some((it) => it.pid === one.pid && it.start === one.start))
  },
  // Windows has no signal to ask with: ending one is TerminateProcess, and forcibly
  // `taskkill /T` ends what it started too.
  end: (one, forcibly) => {
    try {
      if (forcibly)
        execFile("taskkill", ["/PID", String(one.pid), "/T", "/F"], { windowsHide: true })
      else process.kill(one.pid)
    } catch {
      // Gone meanwhile.
    }
  },
}

const table = process.platform === "win32" ? windows : linux

// Waits until none of them is still running or the time is up.
const ended = async (sandbox: Scope, found: readonly Process[], ms: number): Promise<void> => {
  const deadline = Date.now() + ms
  while (found.some((one) => table.alive(sandbox, one)) && Date.now() < deadline)
    // eslint-disable-next-line no-await-in-loop -- Waits for them to end.
    await new Promise((resolve) => setTimeout(resolve, 50))
}

// How a leftover is reported: `claude (123)`, or `claude (123, stopped)` for one that
// could never have exited by itself.
const named = (one: Process): string => `${one.comm} (${one.pid}${one.stopped ? ", stopped" : ""})`

/**
 * Ends the processes still running in the sandbox once its deck has closed: those that
 * started after it was made and whose working folder is inside it, or whose HOME is its
 * home. A harness the deck's hangup reached may take a moment to exit, so each gets
 * three seconds to end by itself; one still running then is asked to end (SIGTERM; on
 * Windows, which can't ask, ended), then ended forcibly (SIGKILL; on Windows with what it
 * started) if it outlives two seconds more, each only should it still be the process
 * found. As ending one may leave a child behind, it looks again, up to five times, until
 * it finds none it hasn't seen. Returns those that had to be ended, by their commands'
 * names and pids, each marked `stopped` should it have been, as a leak the test reports.
 * On Linux it reads /proc; on Windows it asks the system through PowerShell.
 */
export const reap = async (sandbox: Scope): Promise<string[]> => {
  const seen = new Set<string>()
  const leftovers: string[] = []
  for (let round = 0; round < 5; round += 1) {
    // eslint-disable-next-line no-await-in-loop -- Each round looks again after the last.
    const found = (await table.list(sandbox)).filter((one) => !seen.has(`${one.pid}:${one.start}`))
    if (found.length === 0) break
    for (const one of found) seen.add(`${one.pid}:${one.start}`)
    // eslint-disable-next-line no-await-in-loop -- Each round waits on the one found.
    await ended(sandbox, found, 3000)
    // Each as it is now, so one stopped while it was waited for is named stopped.
    // eslint-disable-next-line no-await-in-loop -- As above.
    const leftover = await table.current(sandbox, found)
    for (const one of leftover) table.end(one, false)
    // eslint-disable-next-line no-await-in-loop -- As above.
    await ended(sandbox, leftover, 2000)
    // eslint-disable-next-line no-await-in-loop -- As above.
    for (const one of await table.current(sandbox, leftover)) table.end(one, true)
    leftovers.push(...leftover.map(named))
  }
  return leftovers
}
