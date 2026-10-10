import type { Describer, Description, Digest } from "../murmur/describer.js"

/** One call to a fake describer: the digest and signal it was given, and a way to answer it. */
export type FakeJob = {
  readonly digest: Digest
  readonly signal: AbortSignal | undefined
  /** Answers a held call; a call aborted meanwhile answers undefined on its own. */
  readonly answer: (description: Description | undefined) => void
}

/**
 * A describer as terminal tests drive one: every call is recorded in `jobs`, answered at
 * once with what `reply` makes of the digest (a title from the current prompt or
 * command, by default), or, with `hold`, left until a test answers it. A call aborted
 * answers undefined, as the real one does.
 */
export class FakeDescriber implements Describer {
  readonly jobs: FakeJob[] = []
  /** Whether calls are held for the test to answer. */
  hold = false
  private usable: boolean
  private readonly listeners = new Set<(usable: boolean) => void>()

  constructor(
    options: {
      readonly usable?: boolean
      readonly reply?: (digest: Digest, call: number) => Description | undefined
    } = {},
  ) {
    this.usable = options.usable ?? true
    this.reply =
      options.reply ??
      ((digest, call) => ({
        title: `Title ${call}`,
        summary: `${digest.kind === "agent" ? digest.prompts.at(-1) : digest.command} (${call})`,
      }))
  }

  private readonly reply: (digest: Digest, call: number) => Description | undefined

  describe(digest: Digest, signal?: AbortSignal): Promise<Description | undefined> {
    const call = this.jobs.length + 1
    if (!this.usable) {
      this.jobs.push({ digest, signal, answer: () => {} })
      return Promise.resolve(undefined)
    }
    return new Promise((resolve) => {
      const answer = (description: Description | undefined) => resolve(description)
      this.jobs.push({ digest, signal, answer })
      signal?.addEventListener("abort", () => resolve(undefined), { once: true })
      if (!this.hold) resolve(this.reply(digest, call))
    })
  }

  watchUsable(listener: (usable: boolean) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Murmur becomes usable, or stops being. */
  setUsable(usable: boolean): void {
    this.usable = usable
    for (const listener of this.listeners) listener(usable)
  }

  /** The digests it was given, oldest first. */
  get digests(): readonly Digest[] {
    return this.jobs.map(({ digest }) => digest)
  }
}
