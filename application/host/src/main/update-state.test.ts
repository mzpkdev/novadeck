import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach } from "vitest"

import { context, describe, expect, it } from "../test"
import { keepUpdateState, updateStateOf } from "./update-state"

let folder: string
let file: string

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "novadeck-update-state-"))
  file = join(folder, "update.json")
})
afterEach(() => rm(folder, { recursive: true, force: true }))

describe("what the host remembers about updating", () => {
  it("starts on the stable channel with nothing failed or declined", async () => {
    expect(await keepUpdateState(file).read()).toEqual({
      channel: "stable",
      installFailedOn: undefined,
      moveDeclined: false,
    })
  })

  context("the channel", () => {
    it("persists across launches", async () => {
      await keepUpdateState(file).setChannel("early")
      expect((await keepUpdateState(file).read()).channel).toBe("early")
      await keepUpdateState(file).setChannel("stable")
      expect((await keepUpdateState(file).read()).channel).toBe("stable")
    })

    it("falls back to stable for anything that is not a channel", () => {
      for (const channel of ["nightly", 3, null, ["early"], { channel: "early" }])
        expect(updateStateOf(JSON.stringify({ channel })).channel).toBe("stable")
    })

    it("falls back to the defaults for a damaged file, each field apart", async () => {
      for (const text of ["", "{", "null", "[]", '"early"'])
        expect(updateStateOf(text).channel).toBe("stable")
      expect(updateStateOf('{"channel":"early","installFailedOn":7}')).toEqual({
        channel: "early",
        installFailedOn: undefined,
        moveDeclined: false,
      })
    })

    it("leaves no temporary file behind", async () => {
      await keepUpdateState(file).setChannel("early")
      await keepUpdateState(file).setChannel("stable")
      const { readdir } = await import("node:fs/promises")
      expect(await readdir(folder)).toEqual(["update.json"])
    })

    it("keeps the last of changes made in a row", async () => {
      const state = keepUpdateState(file)
      void state.setChannel("early")
      await state.setChannel("stable")
      expect((await state.read()).channel).toBe("stable")
    })
  })

  context("a failed install", () => {
    it("is marked with the running version and read back for that version alone", async () => {
      const state = keepUpdateState(file)
      state.recordInstallFailure("0.4.2")
      const kept = (await state.read()).installFailedOn
      expect(kept).toBe("0.4.2")
      // A build of a newer version does not see its own version in the mark.
      expect(kept === "0.5.0").toBe(false)
    })

    it("is written at once, as the app may be exiting", async () => {
      keepUpdateState(file).recordInstallFailure("0.4.2")
      expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ installFailedOn: "0.4.2" })
    })

    it("is replaced by a later failure and keeps the channel and the move choice", async () => {
      const state = keepUpdateState(file)
      await state.setChannel("early")
      await state.declineMove()
      state.recordInstallFailure("0.4.2")
      state.recordInstallFailure("0.5.0")
      expect(await state.read()).toEqual({
        channel: "early",
        installFailedOn: "0.5.0",
        moveDeclined: true,
      })
    })

    it("is written even when the file is damaged", async () => {
      await writeFile(file, "{")
      const state = keepUpdateState(file)
      state.recordInstallFailure("0.4.2")
      expect((await state.read()).installFailedOn).toBe("0.4.2")
    })

    it("is kept when the channel changes afterwards", async () => {
      const state = keepUpdateState(file)
      state.recordInstallFailure("0.4.2")
      await state.setChannel("early")
      expect((await state.read()).installFailedOn).toBe("0.4.2")
    })
  })

  it("remembers that the person declined the move to Applications", async () => {
    await keepUpdateState(file).declineMove()
    expect((await keepUpdateState(file).read()).moveDeclined).toBe(true)
  })
})
