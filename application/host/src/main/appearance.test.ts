import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { IpcMainEvent } from "electron"
import { afterEach, beforeEach } from "vitest"

import { appearanceChannel } from "../bridge.js"
import { context, describe, expect, it } from "../test"
import {
  keepAppearance,
  registerAppearanceIpc,
  windowAppearanceOf,
  type WindowAppearance,
} from "./appearance"

describe("an appearance report from the page", () => {
  it("passes with a known scheme and an opaque hex ground", () => {
    for (const scheme of ["system", "light", "dark"] as const)
      expect(windowAppearanceOf({ scheme, ground: "#0F1114" })).toEqual({
        scheme,
        ground: "#0f1114",
      })
  })

  it("passes nothing else the page sent", () => {
    expect(windowAppearanceOf({ scheme: "dark", ground: "#0f1114", extra: 1 })).toEqual({
      scheme: "dark",
      ground: "#0f1114",
    })
  })

  context("when it is not one", () => {
    it("is refused", () => {
      for (const value of [
        undefined,
        null,
        "dark",
        { scheme: "dim", ground: "#0f1114" },
        { scheme: "dark" },
        { scheme: "dark", ground: "#0f1114aa" },
        { scheme: "dark", ground: "#fff" },
        { scheme: "dark", ground: "red" },
        { scheme: "dark", ground: "rgb(0, 0, 0)" },
        { scheme: "dark", ground: "#0f1114; background: url(x)" },
        { scheme: ["dark"], ground: "#0f1114" },
      ])
        expect(windowAppearanceOf(value)).toBeUndefined()
    })
  })
})

// The appearance handler registered on a stand-in for ipcMain, for a page that is the
// app's own or not.
const registered = (own: boolean) => {
  const listeners = new Map<string, (event: IpcMainEvent, value: unknown) => void>()
  const shown: [string, WindowAppearance][] = []
  registerAppearanceIpc(
    { on: (channel, listener) => void listeners.set(channel, listener) },
    {
      window: () => (own ? "window" : undefined),
      show: (window, appearance) => void shown.push([window, appearance]),
    },
  )
  const report = (value: unknown): void =>
    listeners.get(appearanceChannel)?.({} as IpcMainEvent, value)
  return { report, shown }
}

describe("following the page's appearance", () => {
  it("shows a valid report on the window it came from", () => {
    const { report, shown } = registered(true)
    report({ scheme: "dark", ground: "#0f1114" })
    expect(shown).toEqual([["window", { scheme: "dark", ground: "#0f1114" }]])
  })

  it("drops an invalid report", () => {
    const { report, shown } = registered(true)
    report({ scheme: "dark", ground: "javascript:alert(1)" })
    expect(shown).toEqual([])
  })

  it("drops a report from any other sender", () => {
    const { report, shown } = registered(false)
    report({ scheme: "dark", ground: "#0f1114" })
    expect(shown).toEqual([])
  })
})

describe("keeping the appearance between launches", () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "novadeck-appearance-"))
  })
  afterEach(() => rm(directory, { recursive: true, force: true }))

  it("opens the next launch on the last ground reported", async () => {
    const file = join(directory, "appearance.json")
    const first = keepAppearance(file)
    expect(await first.load()).toBeUndefined()
    expect(first.current()).toBeUndefined()
    void first.save({ scheme: "light", ground: "#f2f3f5" })
    await first.save({ scheme: "dark", ground: "#0f1114" })

    const next = keepAppearance(file)
    expect(await next.load()).toEqual({ scheme: "dark", ground: "#0f1114" })
    expect(next.current()).toEqual({ scheme: "dark", ground: "#0f1114" })
  })

  it("writes nothing when the appearance did not change", async () => {
    const file = join(directory, "appearance.json")
    const kept = keepAppearance(file)
    await kept.save({ scheme: "dark", ground: "#0f1114" })
    await writeFile(file, "changed elsewhere")
    await kept.save({ scheme: "dark", ground: "#0f1114" })
    expect(await readFile(file, "utf8")).toBe("changed elsewhere")
  })

  context("when the kept file is corrupt or unsafe", () => {
    it("keeps nothing", async () => {
      const corrupt = join(directory, "corrupt.json")
      const unsafe = join(directory, "unsafe.json")
      await writeFile(corrupt, "{")
      await writeFile(unsafe, JSON.stringify({ scheme: "dark", ground: "url(x)" }))
      expect(await keepAppearance(corrupt).load()).toBeUndefined()
      expect(await keepAppearance(unsafe).load()).toBeUndefined()
    })
  })

  context("when the file cannot be written", () => {
    it("still follows the page", async () => {
      const kept = keepAppearance(join(directory, "missing", "appearance.json"))
      await kept.save({ scheme: "dark", ground: "#0f1114" })
      expect(kept.current()).toEqual({ scheme: "dark", ground: "#0f1114" })
    })
  })
})
