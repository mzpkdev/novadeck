import { DomainError } from "../errors.js"
import type { Terminals } from "../terminals/index.js"
import type { WorkspaceStore } from "./store.js"

/**
 * Removing projects, which spans the store and the terminals. While a project goes, no
 * session or terminal is created in it; terminals already being created finish first,
 * so its removal closes them too, before its records are deleted.
 */
export class Projects {
  /** Each project being removed, and its removal. */
  private readonly removing = new Map<string, Promise<void>>()
  /** Each project's terminals being created. */
  private readonly creating = new Map<string, Set<Promise<unknown>>>()

  constructor(
    private readonly store: WorkspaceStore,
    private readonly terminals: Terminals,
  ) {}

  /** A project being removed is already `NOT_FOUND` for anything new in it. */
  open(projectId: string): void {
    if (this.removing.has(projectId)) throw new DomainError("NOT_FOUND", "Project not found")
  }

  /** Creates something in the project, which its removal waits for. */
  create<T>(projectId: string, work: () => Promise<T>): Promise<T> {
    this.open(projectId)
    const created = work()
    const pending = this.creating.get(projectId) ?? new Set()
    this.creating.set(projectId, pending.add(created))
    const settled = () => {
      pending.delete(created)
      if (pending.size === 0 && this.creating.get(projectId) === pending)
        this.creating.delete(projectId)
    }
    created.then(settled, settled)
    return created
  }

  /**
   * Closes the project's terminals, then deletes it with everything it kept. A second call
   * while it goes shares the first; one after, like one for a project never created, is
   * `NOT_FOUND`.
   */
  remove(projectId: string): Promise<void> {
    const removing = this.removing.get(projectId)
    if (removing) return removing
    this.store.project(projectId)
    const removal = this.removal(projectId).finally(() => this.removing.delete(projectId))
    this.removing.set(projectId, removal)
    return removal
  }

  private async removal(projectId: string): Promise<void> {
    await Promise.allSettled(this.creating.get(projectId) ?? [])
    const sessions = this.store.sessions(projectId).map(({ id }) => id)
    await this.terminals.closeProject(projectId, sessions)
    this.store.removeProject(projectId)
  }
}
