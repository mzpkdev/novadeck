import { execFile } from "node:child_process"
import { join } from "node:path"
import { promisify } from "node:util"

/** A process of a terminal's tree: its pid and its start, which together name it alone. */
export type Member = { readonly pid: number; readonly startedAt: number }

/** Runs Novadeck's relay with `args`, for its output; rejects where it can't run. */
export type RunRelay = (relay: string, args: readonly string[]) => Promise<string>

const runRelay: RunRelay = async (relay, args) =>
  (await promisify(execFile)(relay, [...args], { windowsHide: true, timeout: 10_000 })).stdout

/** One relay run's worth of asks, made in the same tick. */
type Batch<Ask, Answer> = { readonly asks: Ask[]; readonly done: Promise<Answer> }

/**
 * A terminal's process tree on Windows, read and ended through Novadeck's relay
 * (`novadeck-relay tree` and `end`, see application/relay/src/processes.rs): Windows has
 * no process group, and keeps a process's parent pid after that parent ends, when
 * another process may get it. The relay counts a process as a child only if it started no
 * earlier than its recorded parent, and ends a process only if it started when the tree
 * was read. Calls in the same tick share one run, as a runner ending every terminal as it
 * shuts down makes them. Undefined, or nothing ended, where the relay can't run.
 */
export class Trees {
  private reading: Batch<number, Map<number, readonly Member[]> | undefined> | undefined
  private ending: Batch<Member, void> | undefined

  constructor(
    private readonly relay: () => Promise<string | undefined>,
    private readonly run: RunRelay = runRelay,
  ) {}

  /** The process `root` and every one under it, root first; undefined where unknown. */
  async read(root: number): Promise<readonly Member[] | undefined> {
    const batch = (this.reading ??= this.batch((roots) => this.readAll(roots), "reading"))
    batch.asks.push(root)
    return (await batch.done)?.get(root)
  }

  /** Ends each of `members` still running as the process it was; done once all are. */
  async end(members: readonly Member[]): Promise<void> {
    if (members.length === 0) return
    const batch = (this.ending ??= this.batch((all) => this.endAll(all), "ending"))
    batch.asks.push(...members)
    await batch.done
  }

  private batch<Ask, Answer>(
    flush: (asks: readonly Ask[]) => Promise<Answer>,
    field: "reading" | "ending",
  ): Batch<Ask, Answer> {
    const asks: Ask[] = []
    const done = new Promise<void>((resolve) => setImmediate(resolve)).then(() => {
      this[field] = undefined
      return flush(asks)
    })
    return { asks, done }
  }

  private async readAll(
    roots: readonly number[],
  ): Promise<Map<number, readonly Member[]> | undefined> {
    const relay = await this.relay()
    if (relay === undefined) return undefined
    try {
      const output = await this.run(relay, ["tree", ...new Set(roots).values()].map(String))
      return trees(output)
    } catch {
      return undefined
    }
  }

  private async endAll(members: readonly Member[]): Promise<void> {
    const relay = await this.relay()
    if (relay === undefined) return
    const named = [...new Set(members.map(({ pid, startedAt }) => `${pid}:${startedAt}`))]
    await this.run(relay, ["end", ...named]).catch(() => {})
  }
}

/** The relay's trees, by root, from its lines; one it couldn't read is left out. */
export const trees = (output: string): Map<number, readonly Member[]> => {
  const found = new Map<number, readonly Member[]>()
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const { root, processes } = JSON.parse(line) as { root?: unknown; processes?: unknown }
      if (typeof root !== "number" || !Array.isArray(processes)) continue
      found.set(
        root,
        processes.filter(
          (each): each is Member =>
            typeof each === "object" &&
            each !== null &&
            Number.isSafeInteger((each as Member).pid) &&
            Number.isSafeInteger((each as Member).startedAt),
        ),
      )
    } catch {
      // Not a line of the relay's.
    }
  }
  return found
}

/**
 * Ends a Windows process and every program it started, with taskkill, where the relay
 * can't read the tree: by recorded parent pids, which may name an unrelated process
 * whose pid an ended parent left.
 */
export const taskkillTree = async (pid: number): Promise<void> => {
  const windows = process.env.SystemRoot ?? "C:\\Windows"
  await promisify(execFile)(
    join(windows, "System32", "taskkill.exe"),
    ["/T", "/F", "/PID", String(pid)],
    { windowsHide: true, timeout: 5000 },
  )
}

/** Whether any of `members` may still run, by its pid alone: a check made again and again. */
export const anyRunning = (members: readonly Member[]): boolean =>
  members.some(({ pid }) => {
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "EPERM"
    }
  })
