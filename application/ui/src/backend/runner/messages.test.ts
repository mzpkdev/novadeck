import type { TerminalMessages } from "@novadeck/protocol"
import { vi } from "vitest"

import { companionKeyId } from "../../model/companion"
import { context, describe, expect, it } from "../../test"
import { createRunnerMessages, type MailStreams } from "./messages"

const key = { projectId: "p", workspaceSessionId: "s", terminalId: "a" }
const id = companionKeyId(key)

// A terminal's listing as the runner streams it: Codex in t2 sent t1 a message.
const listing = (change: Partial<TerminalMessages> = {}): TerminalMessages => ({
  terminalId: "a",
  handle: "t1",
  delivery: "working",
  paused: false,
  threads: [
    {
      id: "t-1",
      peer: "t2",
      hops: 1,
      allowed: 12,
      held: false,
      messages: [
        {
          id: "m-1",
          thread: "t-1",
          hop: 1,
          from: "t2",
          fromAgent: "codex",
          to: "t1",
          toAgent: "claude",
          text: "Review a.ts.",
          sentAt: 1,
          state: "queued",
          held: null,
          deliveredAt: null,
        },
      ],
    },
  ],
  ...change,
})

// Listings the test pushes, read by the adapter as `messages.watch` would stream them.
const streamed = () => {
  const queued: (TerminalMessages | "end")[] = []
  let wake: (() => void) | undefined
  const watch = vi.fn<MailStreams["watch"]>(() => {
    const iterator: AsyncIterableIterator<TerminalMessages, undefined> = {
      [Symbol.asyncIterator]: () => iterator,
      next: async () => {
        // eslint-disable-next-line no-await-in-loop -- Waits for the next pushed listing.
        while (!queued.length) await new Promise<void>((resolve) => (wake = resolve))
        const next = queued.shift()!
        return next === "end" ? { value: undefined, done: true } : { value: next, done: false }
      },
      return: async () => ({ value: undefined, done: true }),
    }
    return iterator
  })
  const push = (next: TerminalMessages | "end") => {
    queued.push(next)
    wake?.()
  }
  return { watch, push }
}

const streams = (overrides: Partial<MailStreams> = {}) => {
  const { watch, push } = streamed()
  const api = {
    watch,
    pause: vi.fn<MailStreams["pause"]>(async () => {}),
    release: vi.fn<MailStreams["release"]>(async () => {}),
    ...overrides,
  }
  return { api, push, messages: createRunnerMessages(api) }
}

describe("the runner's messages", () => {
  it("follow a terminal's threads as the runner lists them, the pause with them", async () => {
    const { messages, push } = streams()
    messages.follow(key)
    push(listing())
    await vi.waitFor(() =>
      expect(messages.state.getSnapshot().terminals[id]).toEqual({
        handle: "t1",
        agent: true,
        threads: [
          {
            id: "t-1",
            peer: "t2",
            hops: 1,
            allowed: 12,
            held: false,
            messages: [
              {
                id: "m-1",
                hop: 1,
                from: "t2",
                to: "t1",
                text: "Review a.ts.",
                sentAt: 1,
                state: "queued",
                held: null,
                deliveredAt: null,
              },
            ],
          },
        ],
      }),
    )
    push(listing({ paused: true, delivery: "unbound" }))
    await vi.waitFor(() => expect(messages.state.getSnapshot().paused).toBe(true))
    expect(messages.state.getSnapshot().terminals[id]?.agent).toBe(false)
  })

  it("follow each terminal once, and start over after the runner lost it", async () => {
    const { messages, push, api } = streams()
    messages.follow(key)
    messages.follow(key)
    expect(api.watch).toHaveBeenCalledTimes(1)
    push(listing())
    await vi.waitFor(() => expect(messages.state.getSnapshot().terminals[id]).toBeDefined())
    push("end")
    await vi.waitFor(() => expect(messages.state.getSnapshot().terminals[id]).toBeUndefined())
    messages.follow(key)
    expect(api.watch).toHaveBeenCalledTimes(2)
  })

  it("forget a terminal once it closes", async () => {
    const { messages, push } = streams()
    messages.follow(key)
    push(listing())
    await vi.waitFor(() => expect(messages.state.getSnapshot().terminals[id]).toBeDefined())
    messages.unfollow(key)
    expect(messages.state.getSnapshot().terminals[id]).toBeUndefined()
  })

  it("release a thread through the runner, whose listing then tells", () => {
    const { messages, api } = streams()
    messages.release(key, "t-1")
    expect(api.release).toHaveBeenCalledWith("t-1")
  })

  context("when the person pauses", () => {
    it("show it at once, whatever listings from before say", async () => {
      // The runner has yet to answer.
      const { messages, push } = streams({ pause: () => new Promise<void>(() => {}) })
      messages.follow(key)
      messages.pause(true)
      expect(messages.state.getSnapshot().paused).toBe(true)
      push(listing({ paused: false }))
      await vi.waitFor(() => expect(messages.state.getSnapshot().terminals[id]).toBeDefined())
      expect(messages.state.getSnapshot().paused).toBe(true)
    })

    it("show what the runner still does when it refused", async () => {
      const { messages } = streams({ pause: () => Promise.reject(new Error("closing")) })
      messages.pause(true)
      expect(messages.state.getSnapshot().paused).toBe(true)
      await vi.waitFor(() => expect(messages.state.getSnapshot().paused).toBe(false))
    })
  })
})
