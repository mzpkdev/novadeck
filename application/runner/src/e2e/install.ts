import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"

import type { AgentName } from "@novadeck/protocol"
import { z } from "zod"

/** The harnesses an end-to-end test can run: those `harnesses.json` pins. */
export type HarnessName = AgentName

// A harness published on npm: its package and the version the tests run.
const npmPin = z.strictObject({
  package: z.string().min(1),
  version: z.string().min(1),
  bin: z.string().min(1),
})

// A harness published only as an archive, as Antigravity is: the release's address,
// which names its version and stays put, its SHA-512, the program inside it, and the
// manifest its own installer reads for the newest release.
const archivePin = z.strictObject({
  archive: z.url(),
  sha512: z.string().regex(/^[0-9a-f]{128}$/),
  manifest: z.url(),
  version: z.string().min(1),
  member: z.string().min(1),
  bin: z.string().min(1),
})

const pin = z.union([npmPin, archivePin])

/** Each harness's pinned release, from `harnesses.json`. */
export const pins = z
  .partialRecord(z.enum(["claude", "codex", "agy"]), pin)
  .parse(JSON.parse(readFileSync(new URL("harnesses.json", import.meta.url), "utf8")))

// A harness's pin, or why it has none.
const pinOf = (name: HarnessName): z.infer<typeof pin> => {
  const found = pins[name]
  if (!found) throw new Error(`harnesses.json pins no ${name}`)
  return found
}

/**
 * Where installed harnesses are kept between runs: `NOVADECK_E2E_CACHE`, or a folder in
 * the user's cache.
 */
export const cacheFolder = (env: NodeJS.ProcessEnv = process.env): string =>
  env.NOVADECK_E2E_CACHE || join(env.XDG_CACHE_HOME || join(homedir(), ".cache"), "novadeck", "e2e")

// npm beside the node running the tests, so whatever else is on PATH plays no part.
const npm = (): string => {
  const beside = join(dirname(process.execPath), process.platform === "win32" ? "npm.cmd" : "npm")
  return existsSync(beside) ? beside : "npm"
}

/**
 * The environment npm installs with: a home of the cache's own, so neither npm nor a
 * package's install script reads or writes the developer's, and their proxy, should the
 * registry be reachable only through it.
 */
const installEnvironment = (cache: string): NodeJS.ProcessEnv => {
  const proxies = Object.entries(process.env).filter(([name]) =>
    /^(https?_proxy|no_proxy)$/i.test(name),
  )
  return {
    ...Object.fromEntries(proxies),
    HOME: join(cache, "home"),
    USERPROFILE: join(cache, "home"),
    PATH: [dirname(process.execPath), "/usr/bin", "/bin"].join(
      process.platform === "win32" ? ";" : ":",
    ),
    ...(process.platform === "win32" && { SystemRoot: process.env.SystemRoot ?? "C:\\Windows" }),
  }
}

const run = (args: readonly string[], cache: string) =>
  promisify(execFile)(npm(), [...args], {
    env: installEnvironment(cache),
    shell: process.platform === "win32",
    maxBuffer: 16 * 1024 * 1024,
  })

/**
 * The version to install: the pinned one, or with `NOVADECK_E2E_HARNESS=latest`, as a
 * nightly job checks for drift, the newest npm has.
 */
const npmVersion = async (found: z.infer<typeof npmPin>, cache: string): Promise<string> => {
  if (process.env.NOVADECK_E2E_HARNESS !== "latest") return found.version
  const { stdout } = await run(["view", found.package, "version"], cache)
  return stdout.trim()
}

/**
 * Installs the harness's pinned version into the cache, once, and returns the folder
 * holding its program. It never uses a copy installed elsewhere on the machine.
 */
export const installHarness = async (name: HarnessName): Promise<string> => {
  const found = pinOf(name)
  return "archive" in found ? installArchive(name, found) : installPackage(name, found)
}

const installPackage = async (
  name: HarnessName,
  found: z.infer<typeof npmPin>,
): Promise<string> => {
  const cache = cacheFolder()
  await mkdir(join(cache, "home"), { recursive: true })
  const { package: spec, bin } = found
  const wanted = await npmVersion(found, cache)
  const folder = join(cache, `${name}-${wanted}`)
  const bins = join(folder, "node_modules", ".bin")
  if (existsSync(join(bins, bin))) return bins
  // Installed beside it first, then moved into place whole, so a run stopped halfway
  // leaves nothing that looks installed.
  const staging = `${folder}.${process.pid}.tmp`
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  try {
    await run(
      [
        "install",
        "--prefix",
        staging,
        "--no-save",
        "--no-package-lock",
        "--no-audit",
        "--no-fund",
        "--loglevel=error",
        `${spec}@${wanted}`,
      ],
      cache,
    )
    if (!existsSync(join(staging, "node_modules", ".bin", bin)))
      throw new Error(`${spec}@${wanted} installed no ${bin} program`)
    await rm(folder, { recursive: true, force: true })
    await rename(staging, folder)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
  return bins
}

type Release = { readonly version: string; readonly url: string; readonly sha512: string }

/**
 * The release to install: the pinned one, or with `NOVADECK_E2E_HARNESS=latest`, the
 * newest the harness's manifest names, with that manifest's SHA-512.
 */
const archiveRelease = async (found: z.infer<typeof archivePin>): Promise<Release> => {
  if (process.env.NOVADECK_E2E_HARNESS !== "latest")
    return { version: found.version, url: found.archive, sha512: found.sha512 }
  const response = await fetch(found.manifest)
  if (!response.ok) throw new Error(`${found.manifest} answered ${response.status}`)
  return z
    .looseObject({ version: z.string(), url: z.url(), sha512: z.string() })
    .parse(await response.json())
}

/**
 * Installs a harness published as an archive: downloads the release, checks it against
 * its SHA-512 before anything of it runs, and keeps only its program, named as NovaDeck
 * runs it. Only Linux on x86-64 is pinned.
 */
const installArchive = async (
  name: HarnessName,
  found: z.infer<typeof archivePin>,
): Promise<string> => {
  if (process.platform !== "linux" || process.arch !== "x64")
    throw new Error(`${name}'s end-to-end tests run on Linux x86-64 only`)
  const wanted = await archiveRelease(found)
  const folder = join(cacheFolder(), `${name}-${wanted.version}`)
  const bins = join(folder, "bin")
  if (existsSync(join(bins, found.bin))) return bins
  // Unpacked beside it first, then moved into place whole, as a package is.
  const staging = `${folder}.${process.pid}.tmp`
  await rm(staging, { recursive: true, force: true })
  await mkdir(join(staging, "bin"), { recursive: true })
  try {
    const response = await fetch(wanted.url)
    if (!response.ok) throw new Error(`${wanted.url} answered ${response.status}`)
    const archive = Buffer.from(await response.arrayBuffer())
    const sha512 = createHash("sha512").update(archive).digest("hex")
    if (sha512 !== wanted.sha512)
      throw new Error(`${wanted.url} doesn't match its SHA-512: got ${sha512}`)
    await writeFile(join(staging, "release.tar.gz"), archive)
    await promisify(execFile)("tar", ["-xzf", "release.tar.gz", found.member], { cwd: staging })
    await rename(join(staging, found.member), join(staging, "bin", found.bin))
    await rm(join(staging, "release.tar.gz"))
    await rm(folder, { recursive: true, force: true })
    await rename(staging, folder)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
  return bins
}
