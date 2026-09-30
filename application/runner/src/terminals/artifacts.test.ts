import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it as base } from "../test.js"
import {
  capture,
  captureWindow,
  readRequest,
  remember,
  type Artifact,
  type Captured,
  type Place,
} from "./artifacts.js"

type Fixture = {
  /** The project folder, where the terminal is. */
  project: string
  /** A folder beside it, outside the project. */
  outside: string
  place: Place
}

const it = base.extend<{ fixture: Fixture }>({
  fixture: async ({ resources }, use) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "novadeck-artifacts-")))
    resources.defer(() => rmSync(root, { recursive: true, force: true }))
    const project = join(root, "project")
    const outside = join(root, "outside")
    mkdirSync(join(project, "src"), { recursive: true })
    mkdirSync(outside)
    await use({ project, outside, place: { cwd: project, project, folders: [project] } })
  },
})

const numbered = (count: number) =>
  Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n") + "\n"

// A 1×1 transparent PNG.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
)

describe("what an agent may show", () => {
  it("is a file inside one of the terminal's folders, by a path from its directory", async ({
    fixture,
  }) => {
    writeFileSync(join(fixture.project, "src", "a.ts"), "const a = 1\n")
    const place = { ...fixture.place, cwd: join(fixture.project, "src") }
    await expect(capture({ path: "a.ts" }, place)).resolves.toMatchObject({
      ok: true,
      name: "a.ts",
      detail: `${join("src", "a.ts")} · whole file`,
      content: { kind: "file", path: join(fixture.project, "src", "a.ts") },
    })
    await expect(
      capture({ path: join(fixture.project, "src", "a.ts") }, fixture.place),
    ).resolves.toMatchObject({ ok: true })
  })

  it("is nothing outside them, even through a symlink inside", async ({ fixture }) => {
    writeFileSync(join(fixture.outside, "secret.txt"), "secret\n")
    symlinkSync(join(fixture.outside, "secret.txt"), join(fixture.project, "link.txt"))
    const outside = { ok: false, reason: "That file is outside this project." }
    await expect(capture({ path: "../outside/secret.txt" }, fixture.place)).resolves.toEqual(
      outside,
    )
    await expect(capture({ path: "link.txt" }, fixture.place)).resolves.toEqual(outside)
    // Another folder the terminal may show from, as where it started.
    await expect(
      capture(
        { path: "link.txt" },
        { ...fixture.place, folders: [fixture.project, fixture.outside] },
      ),
    ).resolves.toMatchObject({ ok: true, detail: "link.txt · whole file" })
  })

  it("is named as given where it is not in the project, and by its title when it has one", async ({
    fixture,
  }) => {
    writeFileSync(join(fixture.outside, "notes.md"), "# Notes\n")
    const place = { ...fixture.place, folders: [fixture.project, fixture.outside] }
    const path = join(fixture.outside, "notes.md")
    await expect(capture({ path, title: "My notes" }, place)).resolves.toMatchObject({
      ok: true,
      name: "My notes",
      detail: `${path} · whole file`,
    })
  })

  it("is never a folder, a missing file, or one too large", async ({ fixture }) => {
    writeFileSync(join(fixture.project, "big.txt"), "a".repeat(1024 * 1024 + 1))
    writeFileSync(join(fixture.project, "big.png"), Buffer.alloc(8 * 1024 * 1024 + 1))
    writeFileSync(join(fixture.project, "fine.png"), Buffer.alloc(1024 * 1024 + 1))
    await expect(capture({ path: "src" }, fixture.place)).resolves.toEqual({
      ok: false,
      reason: "That's a folder; only files can be shown.",
    })
    await expect(capture({ path: "gone.txt" }, fixture.place)).resolves.toEqual({
      ok: false,
      reason: "That file doesn't exist.",
    })
    await expect(capture({ path: "big.txt" }, fixture.place)).resolves.toEqual({
      ok: false,
      reason: "It's too large to show (limit 1 MB).",
    })
    await expect(capture({ path: "big.png" }, fixture.place)).resolves.toEqual({
      ok: false,
      reason: "It's too large to show (limit 8 MB).",
    })
    // An image may be larger than a text file.
    await expect(capture({ path: "fine.png" }, fixture.place)).resolves.toMatchObject({
      ok: true,
      detail: "1.0 MB PNG",
    })
  })

  it("is an image by its extension, as a data URL of its type", async ({ fixture }) => {
    writeFileSync(join(fixture.project, "dot.png"), png)
    writeFileSync(join(fixture.project, "icon.SVG"), "<svg/>")
    await expect(capture({ path: "dot.png" }, fixture.place)).resolves.toMatchObject({
      ok: true,
      name: "dot.png",
      detail: `${png.length} B PNG`,
      content: { kind: "image", src: `data:image/png;base64,${png.toString("base64")}` },
    })
    await expect(capture({ path: "icon.SVG" }, fixture.place)).resolves.toMatchObject({
      detail: "6 B SVG",
      content: { kind: "image", src: expect.stringMatching(/^data:image\/svg\+xml;base64,/) },
    })
  })

  it("is a text file only without a NUL byte in its start", async ({ fixture }) => {
    writeFileSync(join(fixture.project, "a.bin"), Buffer.from([0x41, 0x00, 0x42]))
    writeFileSync(join(fixture.project, "late.txt"), `${"a".repeat(9 * 1024)}\0\n`)
    await expect(capture({ path: "a.bin" }, fixture.place)).resolves.toEqual({
      ok: false,
      reason: "Only images and text files can be shown.",
    })
    await expect(capture({ path: "late.txt" }, fixture.place)).resolves.toMatchObject({ ok: true })
  })
})

describe("a text file's captured lines", () => {
  it("are all of a short file, with the lines pointed at", async ({ fixture }) => {
    writeFileSync(join(fixture.project, "a.txt"), numbered(3))
    await expect(capture({ path: "a.txt" }, fixture.place)).resolves.toMatchObject({
      detail: "a.txt · whole file",
      content: { firstLine: 1, lines: ["line 1", "line 2", "line 3"], from: 1, to: 3 },
    })
    await expect(
      capture({ path: "a.txt", lines: { from: 2, to: 9 } }, fixture.place),
    ).resolves.toMatchObject({
      detail: "a.txt · lines 2–3",
      content: { firstLine: 1, lines: ["line 1", "line 2", "line 3"], from: 2, to: 3 },
    })
    await expect(
      capture({ path: "a.txt", lines: { from: 4, to: 5 } }, fixture.place),
    ).resolves.toEqual({ ok: false, reason: "It has only 3 lines." })
  })

  it("are the start of a long file, or around the lines pointed at", async ({ fixture }) => {
    writeFileSync(join(fixture.project, "long.txt"), numbered(1000))
    const start = await capture({ path: "long.txt" }, fixture.place)
    expect(start).toMatchObject({
      detail: "long.txt · lines 1–400",
      content: { firstLine: 1, from: 1, to: 400 },
    })
    expect(start.ok && start.content.kind === "file" && start.content.lines).toHaveLength(400)
    const around = await capture({ path: "long.txt", lines: { from: 500, to: 510 } }, fixture.place)
    expect(around).toMatchObject({
      detail: "long.txt · lines 500–510",
      content: { firstLine: 460, from: 500, to: 510 },
    })
    const lines = around.ok && around.content.kind === "file" ? around.content.lines : []
    expect([lines[0], lines.at(-1)]).toEqual(["line 460", "line 550"])
  })

  it("keep to the file's ends and the protocol's bounds", () => {
    expect(captureWindow(1000, { from: 10, to: 995 })).toEqual({
      first: 1,
      last: 1000,
      from: 10,
      to: 995,
    })
    expect(captureWindow(5000, { from: 100, to: 4000 })).toEqual({
      first: 60,
      last: 2059,
      from: 100,
      to: 2059,
    })
    expect(captureWindow(1, undefined)).toEqual({ first: 1, last: 1, from: 1, to: 1 })
  })
})

describe("a present request", () => {
  it("names a path, and only lines that run forward", () => {
    expect(readRequest({ path: "a.ts", lines: { from: 2, to: 2 }, open: true })).toEqual({
      ok: true,
      request: { path: "a.ts", lines: { from: 2, to: 2 }, open: true },
    })
    expect(readRequest({ path: "a.ts", lines: { from: 3, to: 2 } })).toEqual({
      ok: false,
      reason: 'The request\'s "lines" is not valid.',
    })
    expect(readRequest({ path: "" })).toMatchObject({ ok: false })
    expect(readRequest({ path: "a.ts", title: "t".repeat(257) })).toMatchObject({ ok: false })
    expect(readRequest({ path: "a.ts", extra: 1 })).toMatchObject({ ok: false })
  })
})

const captured = (id: string, line = "a"): Captured => ({
  ok: true,
  id,
  name: `${id}.txt`,
  detail: `${id}.txt · whole file`,
  content: { kind: "file", path: `/p/${id}.txt`, firstLine: 1, lines: [line], from: 1, to: 1 },
})

describe("what a terminal shows", () => {
  it("replaces what is shown again with a later version, as the newest", () => {
    let shown: ReadonlyMap<string, Artifact> = new Map()
    shown = remember(shown, captured("a"), false)
    shown = remember(shown, captured("b"), false)
    shown = remember(shown, captured("a", "changed"), true)
    expect([...shown.values()].map((artifact) => artifact.shown)).toEqual([
      {
        id: "b",
        kind: "file",
        name: "b.txt",
        detail: "b.txt · whole file",
        version: 1,
        asked: false,
      },
      {
        id: "a",
        kind: "file",
        name: "a.txt",
        detail: "a.txt · whole file",
        version: 2,
        asked: true,
      },
    ])
    expect(shown.get("a")?.content).toMatchObject({ lines: ["changed"] })
  })

  it("keeps the latest 64", () => {
    let shown: ReadonlyMap<string, Artifact> = new Map()
    for (let index = 0; index < 65; index += 1)
      shown = remember(shown, captured(`f${index}`), false)
    expect(shown.size).toBe(64)
    expect([...shown.keys()][0]).toBe("f1")
  })
})
