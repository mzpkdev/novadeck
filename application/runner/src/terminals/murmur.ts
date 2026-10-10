import { basename, isAbsolute, relative } from "node:path"

import { terminalTitle, type AgentName, type ForegroundProcess } from "@novadeck/protocol"

import type { Activity } from "../harnesses/activity.js"
import { tailLines } from "../harnesses/follow.js"
import type { Items } from "../harnesses/replies.js"
import { agentLabel } from "../messaging/mailbox.js"
import type {
  AgentDigest,
  Describer,
  Description,
  Digest,
  Previous,
  ShellDigest,
} from "../murmur/describer.js"
import type { PeerTerminal } from "./peers.js"
import { busiestFolders, promptChars, shorten, type Work } from "./work.js"

/*
 * When a terminal is described by murmur, and from what (see docs/agent-messaging.md,
 * "Naming"). The terminals own the triggers, the digests and the coalescing; the service
 * behind the `Describer` owns the model, its prompt, redaction and validation.
 */

/**
 * What drift is told by: the root's plan title, its main "works in" folder, its branch.
 * Null is no information (no plan, no folder written in yet, a branch not read in time),
 * never a change.
 */
export type Facts = {
  readonly plan: string | null
  readonly folder: string | null
  readonly branch: string | null
}

// Whether facts differ where both say something: unknown on either side is no change.
const differs = (a: Facts, b: Facts): boolean =>
  (["plan", "folder", "branch"] as const).some(
    (fact) => a[fact] !== null && b[fact] !== null && a[fact] !== b[fact],
  )

/** The waits and counts that decide when murmur describes; tests shorten them. */
export type MurmurTimes = {
  /**
   * How long an agent terminal's trigger waits for quiet before it describes, in
   * milliseconds, so a burst (a prompt, then the turn's end) makes one description, and
   * the reply is written to the transcript by then.
   */
  readonly settleMs: number
  /**
   * How long a plain shell's program must have run before its change describes: a
   * command that ends sooner (`ls`, `git status`) never does.
   */
  readonly shellRunMs: number
  /** How long a plain shell's change of directory waits for quiet. */
  readonly shellSettleMs: number
  /**
   * How many of the person's prompts since the last description make the next one, at
   * the end of a turn. A description made while a turn ran had no reply of that turn to
   * show, so that turn's end describes again whatever the count.
   */
  readonly promptsBetween: number
}

export const defaultTimes: MurmurTimes = {
  settleMs: 3_000,
  shellRunMs: 5_000,
  shellSettleMs: 3_000,
  promptsBetween: 4,
}

/** How much of the agent's last reply murmur is shown, in characters, from its end. */
export const replyChars = 1500
/** How many rows of a plain shell's screen, how long each, murmur is shown; the lowest rows win. */
export const screenRows = 30
export const screenColumns = 160
/** The longest command line murmur is shown. */
export const commandChars = 300

// Characters no reply or screen row shows to a model: C0 and C1 control characters, and DEL.
// eslint-disable-next-line no-control-regex -- These are the characters it removes.
const control = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g
// eslint-disable-next-line no-control-regex -- Escape sequences, whole.
const escapes = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g

/** The last segment or two of a path, as a place is named. */
export const placeName = (path: string): string => {
  const parts = path.split(/[\\/]+/).filter(Boolean)
  return parts.slice(-2).join("/") || path
}

/** `text` cut to its last `max` characters (code points), with an ellipsis where it was cut. */
export const tailOf = (text: string, max: number): string => {
  const characters = [...text]
  return characters.length > max ? `…${characters.slice(-(max - 1)).join("")}` : text
}

/**
 * The tail of what the agent said last since the person's latest prompt and its latest
 * tool step, as its transcript records it, through its harness's items; null when it
 * said nothing since or the transcript can't be read. Words before a tool call are its
 * working notes, not its reply. Only the end of the transcript is read.
 */
export const replyTail = async (
  path: string,
  items: Items,
  chars = replyChars,
): Promise<string | null> => {
  const lines = await tailLines(path)
  let reply: string | undefined
  for (const line of lines ?? [])
    for (const { role, kind, text } of items(line)) {
      if (role === "user" || role === "tool" || kind === "tool-call") reply = undefined
      else if (role === "assistant" && kind === "text" && text.trim()) reply = text
    }
  if (reply === undefined) return null
  const clean = reply.replace(escapes, "").replace(control, " ").trim()
  return clean ? tailOf(clean, chars) : null
}

/** A folder as murmur is shown it: inside the project, relative to it; else its last segments. */
const shownFolder = (folder: string, projectFolder: string | undefined): string => {
  if (projectFolder !== undefined) {
    const inside = relative(projectFolder, folder)
    if (!inside) return "."
    if (!inside.startsWith("..") && !isAbsolute(inside)) return inside
  }
  return placeName(folder)
}

/** The prompts murmur is shown, oldest first: the first the person gave, if it left the recent ones. */
export const promptsOf = (work: Work | null): readonly string[] => {
  if (!work) return []
  const recent = work.recent.length > 0 ? work.recent : work.latest ? [work.latest] : []
  const first =
    work.first !== null && !recent.some((prompt) => shorten(prompt, promptChars) === work.first)
      ? [work.first]
      : []
  return [...first, ...recent]
}

/** What murmur is shown of an agent's terminal; null when nothing is known of what the person asked. */
export const agentDigest = (input: {
  readonly harness: AgentName
  readonly projectFolder: string | undefined
  readonly cwd: string
  readonly branch: string | null
  readonly plan: string | null
  readonly work: Work | null
  readonly reply: string | null
  readonly previous: Previous
}): AgentDigest | null => {
  const prompts = promptsOf(input.work)
  if (prompts.length === 0) return null
  const { projectFolder } = input
  return {
    kind: "agent",
    harness: agentLabel(input.harness),
    project: projectFolder === undefined ? null : basename(projectFolder) || null,
    folder: placeName(input.cwd),
    branch: input.branch,
    plan: input.plan,
    folders: busiestFolders(input.work?.folders ?? {}, 3).map(({ folder }) =>
      shownFolder(folder, projectFolder),
    ),
    prompts,
    reply: input.reply,
    previous: input.previous,
  }
}

/**
 * The command a plain shell's foreground program runs with, or its name where the
 * platform tells no more; null at the shell's own prompt, and where none is told.
 */
export const commandOf = (
  program: ForegroundProcess | null,
  shell: string | undefined,
): string | null => {
  if (!program || (shell !== undefined && program.name === shell)) return null
  const line = program.argv && program.argv.length > 0 ? program.argv.join(" ") : program.name
  return shorten(line, commandChars)
}

/**
 * The visible rows of a plain shell's screen as murmur is shown them: control characters
 * out, each row trimmed and cut, the blank ones above and below dropped, and at most the
 * last `screenRows` kept.
 */
export const screenOf = (rows: readonly string[]): readonly string[] => {
  const kept = rows.map((row) =>
    shorten(row.replace(escapes, "").replace(control, " "), screenColumns),
  )
  while (kept.at(-1) === "") kept.pop()
  const start = kept.findIndex((row) => row !== "")
  return start < 0 ? [] : kept.slice(Math.max(start, kept.length - screenRows))
}

/**
 * What murmur is shown of a plain shell's terminal; null when there is nothing to say of
 * it: no program runs and the screen shows no more than a prompt.
 */
export const shellDigest = (input: {
  readonly projectFolder: string | undefined
  readonly cwd: string
  readonly command: string | null
  readonly rows: readonly string[]
  readonly previous: Previous
}): ShellDigest | null => {
  const screen = screenOf(input.rows)
  if (input.command === null && screen.length < 2) return null
  const { projectFolder } = input
  return {
    kind: "shell",
    project: projectFolder === undefined ? null : basename(projectFolder) || null,
    folder: placeName(input.cwd),
    command: input.command,
    screen,
    previous: input.previous,
  }
}

type Job = {
  readonly id: string
  timer: NodeJS.Timeout | undefined
  controller: AbortController | undefined
  /** The newest job's number. */
  latest: number
  /** Whether a job is building or waiting on the describer. */
  running: boolean
}

/**
 * Describes each terminal at most one job at a time: a request waits out its quiet
 * (a newer request for the same terminal restarts the wait), builds its digest then, and
 * aborts the terminal's older job before the describer is asked, so the newest digest
 * wins. A description lands only while its job is the newest.
 */
export class Descriptions {
  private readonly jobs = new Map<string, Job>()

  constructor(private readonly describer: Describer) {}

  /** Whether a request waits or a job runs for the terminal. */
  busy(id: string): boolean {
    const job = this.jobs.get(id)
    return job !== undefined && (job.timer !== undefined || job.running)
  }

  /**
   * Asks for the terminal's description once `delayMs` pass without another request.
   * `build` makes the digest (undefined for none, as when the terminal is gone) and
   * `done` takes what the describer wrote.
   */
  request(
    id: string,
    delayMs: number,
    build: () => Promise<Digest | undefined>,
    done: (description: Description, digest: Digest) => void,
  ): void {
    const job = this.jobs.get(id) ?? {
      id,
      timer: undefined,
      controller: undefined,
      latest: 0,
      running: false,
    }
    this.jobs.set(id, job)
    clearTimeout(job.timer)
    job.timer = setTimeout(() => {
      job.timer = undefined
      void this.run(job, build, done)
    }, delayMs)
    job.timer.unref()
  }

  /** Drops a request still waiting for its quiet; a job already running goes on. */
  withdraw(id: string): void {
    const job = this.jobs.get(id)
    if (!job) return
    clearTimeout(job.timer)
    job.timer = undefined
    if (!job.running) this.jobs.delete(id)
  }

  /** Forgets the terminal: its request is dropped and its running job aborted. */
  cancel(id: string): void {
    const job = this.jobs.get(id)
    if (!job) return
    clearTimeout(job.timer)
    job.latest += 1
    job.controller?.abort()
    this.jobs.delete(id)
  }

  stop(): void {
    for (const id of this.jobs.keys()) this.cancel(id)
  }

  private async run(
    job: Job,
    build: () => Promise<Digest | undefined>,
    done: (description: Description, digest: Digest) => void,
  ): Promise<void> {
    job.latest += 1
    const mine = job.latest
    job.controller?.abort()
    const controller = new AbortController()
    job.controller = controller
    job.running = true
    try {
      const digest = await build()
      if (!digest || job.latest !== mine) return
      const description = await this.describer.describe(digest, controller.signal)
      if (description && job.latest === mine && !controller.signal.aborted)
        done(description, digest)
    } catch (error) {
      console.error("Novadeck could not describe a terminal:", error)
    } finally {
      if (job.latest === mine) {
        job.running = false
        job.controller = undefined
        // Dropped once nothing waits.
        if (job.timer === undefined && this.jobs.get(job.id) === job) this.jobs.delete(job.id)
      }
    }
  }
}

/** What a terminal's agent report tells murmur, as the terminal manager reads it. */
export type Reported = {
  /** The root session is a new one. */
  readonly session: boolean
  /** The harness compacted the root session's context. */
  readonly compacted: boolean
  /** How many of the person's prompts started root turns. */
  readonly prompts: number
  /** A root turn ended. */
  readonly ended: boolean
}

/** What murmur needs of a running terminal, beyond what peers read of it. */
export type MurmurSubject = PeerTerminal & {
  /** The agent bound there, if one is; a terminal with none is a plain shell. */
  readonly agent: AgentName | null
  /** The bound session's transcript, where its hooks named one. */
  readonly transcript: string | null
  /** The program in the foreground, with the shell's own name to tell its prompt. */
  readonly program: ForegroundProcess | null
  readonly shell: string | undefined
}

/** What the manager gives murmur's triggers to read and write. */
export type MurmurHost = {
  /** A running terminal, read afresh; undefined once it is gone. */
  subject(terminalId: string): MurmurSubject | undefined
  subjects(): readonly MurmurSubject[]
  /** The terminal's plan, busiest folder and branch: what drift is told by and the digest shows. */
  facts(subject: MurmurSubject): Promise<Facts>
  /** The visible rows of the terminal's screen. */
  screen(terminalId: string): Promise<readonly string[] | undefined>
  /** The harness's reader of its transcript's lines. */
  items(agent: AgentName): Items | undefined
  projectFolder(sessionId: string): string | undefined
  /** Gives the terminal murmur's description; nothing when it is gone. */
  described(terminalId: string, description: Description): void
}

// What murmur keeps of a terminal between triggers; lost with the runner.
type Watch = {
  /** The person's prompts since the last description. */
  prompts: number
  /** Whether the last description was made while a turn ran, so without that turn's reply. */
  partial: boolean
  /** The facts at the last description, and those drift last fired for. */
  baseline: Facts | null
  driftedTo: Facts | null
  /** A description is owed once the person's first prompt there is known (a new session). */
  owed: boolean
  /** The program in a plain shell's foreground, as a key, and since when; null at the prompt. */
  program: { readonly key: string | null; readonly since: number }
}

const programKey = (program: ForegroundProcess | null): string | null =>
  program === null ? null : JSON.stringify([program.name, program.argv])

/**
 * Decides when each terminal is described and what from, and hands the result to the
 * manager. Without a describer, nothing happens.
 *
 * An agent's terminal is described: on a new root session once the person's first prompt
 * is known; after a compaction; when its plan, branch or busiest folder drifted from
 * where they were at the last description; when a turn ends and the person prompted
 * since, which is after the next prompt if the last description had no reply to show,
 * else after `promptsBetween` prompts; and, the first time, once that first prompt is
 * known. A plain shell's: when the program in its foreground changed, once it has run
 * `shellRunMs`; when it returns to the prompt after such a run; and when its directory
 * changed. The foreground is sampled only where the platform tells it, so on Windows
 * only the directory triggers. When murmur becomes usable, running terminals with no
 * description yet are described.
 */
export class Murmur {
  private readonly descriptions: Descriptions
  private readonly watches = new Map<string, Watch>()
  private readonly times: MurmurTimes
  private readonly unwatch: () => void
  private usable = true

  constructor(
    describer: Describer,
    private readonly host: MurmurHost,
    times: Partial<MurmurTimes> = {},
  ) {
    this.times = { ...defaultTimes, ...times }
    this.descriptions = new Descriptions(describer)
    this.unwatch = describer.watchUsable((usable) => {
      this.usable = usable
      if (usable) this.catchUp()
    })
  }

  /** A terminal is gone or closed. */
  gone(terminalId: string): void {
    this.descriptions.cancel(terminalId)
    this.watches.delete(terminalId)
  }

  stop(): void {
    this.unwatch()
    this.descriptions.stop()
    this.watches.clear()
  }

  /** An agent's report, as the manager read it for the terminal's root session. */
  async reported(terminalId: string, told: Reported): Promise<void> {
    try {
      await this.react(terminalId, told)
    } catch (error) {
      console.error("Novadeck could not look at a terminal to describe it:", error)
    }
  }

  private async react(terminalId: string, told: Reported): Promise<void> {
    if (!this.usable) return
    const subject = this.host.subject(terminalId)
    if (!subject?.agent) return
    const watch = this.watch(terminalId)
    if (told.session) {
      watch.owed = true
      watch.prompts = 0
      watch.partial = false
      watch.baseline = null
      watch.driftedTo = null
    }
    watch.prompts += told.prompts
    const prompted = subject.work?.first !== null && subject.work?.first !== undefined
    // The first description, and a new session's, wait for the person's first prompt
    // there; one in the making is not asked for again at each report.
    if (
      (watch.owed || subject.naming.murmur === null) &&
      prompted &&
      !this.descriptions.busy(terminalId)
    ) {
      watch.owed = false
      this.ask(terminalId, this.times.settleMs)
      return
    }
    if (told.compacted && prompted) {
      this.ask(terminalId, this.times.settleMs)
      return
    }
    if (!told.ended || !prompted) return
    if (watch.partial || watch.prompts >= this.times.promptsBetween) {
      this.ask(terminalId, this.times.settleMs)
      return
    }
    // Where nothing else fires, a turn's end looks at whether the work drifted.
    const facts = await this.host.facts(subject)
    if (!this.host.subject(terminalId)) return
    const { baseline, driftedTo } = watch
    if (!baseline || !differs(baseline, facts)) return
    if (driftedTo && !differs(driftedTo, facts)) return
    watch.driftedTo = facts
    this.ask(terminalId, this.times.settleMs)
  }

  /** A plain shell's foreground program changed (sampled, so never on Windows). */
  sampled(terminalId: string): void {
    if (!this.usable) return
    const subject = this.host.subject(terminalId)
    if (!subject || subject.agent) return
    const watch = this.watch(terminalId)
    // The shell's own name is its prompt: no program.
    const key =
      commandOf(subject.program, subject.shell) === null ? null : programKey(subject.program)
    if (key === watch.program.key) return
    const ranMs = Date.now() - watch.program.since
    const was = watch.program.key
    watch.program = { key, since: Date.now() }
    // A command that ended before it ran long enough never described anything.
    this.descriptions.withdraw(terminalId)
    if (key === null) {
      if (was !== null && ranMs >= this.times.shellRunMs)
        this.ask(terminalId, this.times.shellSettleMs)
      return
    }
    this.ask(terminalId, this.times.shellRunMs, key)
  }

  /** A plain shell showed its prompt in another directory. */
  moved(terminalId: string): void {
    if (!this.usable) return
    const subject = this.host.subject(terminalId)
    if (!subject || subject.agent) return
    this.watch(terminalId)
    this.ask(terminalId, this.times.shellSettleMs)
  }

  private watch(terminalId: string): Watch {
    let watch = this.watches.get(terminalId)
    if (!watch) {
      watch = {
        prompts: 0,
        partial: false,
        baseline: null,
        driftedTo: null,
        owed: false,
        program: { key: null, since: Date.now() },
      }
      this.watches.set(terminalId, watch)
    }
    return watch
  }

  // Murmur became usable: terminals with no description yet get one.
  private catchUp(): void {
    for (const subject of this.host.subjects()) {
      if (subject.naming.murmur !== null) continue
      if (subject.agent && !subject.work?.first) continue
      this.watch(subject.summary.id)
      this.ask(subject.summary.id, subject.agent ? this.times.settleMs : this.times.shellSettleMs)
    }
  }

  /**
   * Asks for the terminal's description after `delayMs`. A plain shell's, with the key of
   * the program it was asked for, goes only while that program still holds the foreground.
   */
  private ask(terminalId: string, delayMs: number, program?: string): void {
    this.descriptions.request(
      terminalId,
      delayMs,
      async () => {
        const subject = this.host.subject(terminalId)
        if (!subject) return undefined
        if (program !== undefined && programKey(subject.program) !== program) return undefined
        return subject.agent ? this.agentDigestOf(subject) : this.shellDigestOf(subject)
      },
      (description) => this.stored(terminalId, description),
    )
  }

  // The digest an agent's terminal is described from, and the facts it is built on.
  private async agentDigestOf(subject: MurmurSubject): Promise<Digest | undefined> {
    const id = subject.summary.id
    const agent = subject.agent!
    const [facts, reply] = await Promise.all([this.host.facts(subject), this.replyOf(subject)])
    // Read again after waiting: the terminal may have moved on or gone.
    const now = this.host.subject(id)
    if (!now?.agent) return undefined
    const digest = agentDigest({
      harness: agent,
      projectFolder: this.host.projectFolder(now.summary.sessionId),
      cwd: now.summary.cwd,
      branch: facts.branch,
      plan: facts.plan,
      work: now.work,
      reply,
      previous: now.naming.murmur,
    })
    if (!digest) return undefined
    // What the digest was built from is what drift is measured from, and what the
    // person prompted so far is described.
    const watch = this.watch(id)
    watch.baseline = facts
    watch.driftedTo = null
    watch.prompts = 0
    watch.partial = now.activity?.state === "working"
    return digest
  }

  /**
   * The tail of the agent's last reply: from its transcript, up to `replyChars`; else, where
   * its harness tells no transcript's items, the preview its turn's end reported (a
   * hundred or so characters), only once the turn is over.
   */
  private async replyOf(subject: MurmurSubject): Promise<string | null> {
    const items = subject.agent ? this.host.items(subject.agent) : undefined
    if (items && subject.transcript) return replyTail(subject.transcript, items)
    return finishedReply(subject.activity)
  }

  private async shellDigestOf(subject: MurmurSubject): Promise<Digest | undefined> {
    const rows = await this.host.screen(subject.summary.id)
    const now = this.host.subject(subject.summary.id)
    if (!rows || !now || now.agent) return undefined
    return (
      shellDigest({
        projectFolder: this.host.projectFolder(now.summary.sessionId),
        cwd: now.summary.cwd,
        command: commandOf(now.program, now.shell),
        rows,
        previous: now.naming.murmur,
      }) ?? undefined
    )
  }

  // A description came back: it names the terminal if its title can be one.
  private stored(terminalId: string, description: Description): void {
    const title = description.title.trim()
    if (!terminalTitle.safeParse(title).success || !description.summary.trim()) return
    this.host.described(terminalId, {
      title,
      summary: description.summary.trim(),
    })
  }
}

/** The preview of the agent's last reply, when its turn is over. */
const finishedReply = (activity: Activity | null): string | null =>
  activity && activity.state !== "working" ? (activity.lastTurn?.reply ?? null) : null
