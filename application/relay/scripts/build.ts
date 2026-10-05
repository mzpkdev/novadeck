import { createHash } from "node:crypto"
import { chmod, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { binaryName, compile, hasCargo, pinnedRust, root, run } from "./recipe.ts"

// `pnpm build` for the relay: the prebuilt binary for this platform when the source is
// the one `prebuilt.json` pins, so building NovaDeck needs no Rust; otherwise, as when
// someone changed the relay, built from source with cargo.
//
//   node scripts/build.ts           builds dist/novadeck-relay[.exe]
//   node scripts/build.ts --test    runs the relay's own tests, where cargo is installed
//   node scripts/build.ts --lint    runs clippy, in CI for every platform it ships for
//   node scripts/build.ts --format  formats the relay's Rust; --format-check checks it
//   node scripts/build.ts --hash    prints the source's hash
//   node scripts/build.ts --check   fails when prebuilt.json pins another source
//   node scripts/build.ts --asset   prints this platform's binary's name in a release
//   node scripts/build.ts --pin     pins the binaries the Relay workflow published for
//                                   this source, writing prebuilt.json
//   node scripts/build.ts --prefix  prints the tag prefix this source's releases share
//
// NOVADECK_RELAY_FROM_SOURCE=1 always builds from source, as CI does to keep it honest;
// NOVADECK_RELAY_UNIVERSAL=1 on macOS builds both architectures into one binary, as the
// universal app needs.

const releases = "https://github.com/mzpkdev/novadeck/releases/download"

/** The binaries published for one version of the relay's source, by target. */
export type Prebuilt = {
  readonly source: string
  /** The release that holds them, as each publish gets a tag of its own. */
  readonly release: string
  readonly files: { readonly [target: string]: { readonly sha256: string } }
}

/**
 * Every binary published for a version of the source: the platforms the app ships for,
 * and Linux on ARM, where a runner may be deployed on its own, as on a server.
 */
export const targets = ["linux-x64", "linux-arm64", "darwin-universal", "win32-x64"] as const

/** The binary for a platform: macOS's covers both architectures. */
export const target = (platform: string = process.platform, arch: string = process.arch) =>
  platform === "darwin" ? "darwin-universal" : `${platform}-${arch}`

/** What a target's binary is called among a release's assets. */
export const assetName = (key: string): string =>
  `novadeck-relay-${key}${key.startsWith("win32-") ? ".exe" : ""}`

/**
 * How the tags of a source version's releases start: each publish adds its run's id, as
 * a pruned release's tag can't be used again (see the Relay workflow).
 */
export const releasePrefix = (source: string): string => `relay-${source.slice(0, 16)}`

const repository = "mzpkdev/novadeck"

const sha256 = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex")

/**
 * The hash of the files the relay builds from, each by its path and content. Line endings
 * don't count, so a Windows checkout hashes alike.
 */
export const sourceHash = (files: readonly { path: string; text: string }[]): string => {
  const hash = createHash("sha256")
  for (const { path, text } of files.toSorted((one, other) => (one.path < other.path ? -1 : 1)))
    hash.update(`${path.replaceAll("\\", "/")}\0${text.replaceAll("\r\n", "\n")}\0`)
  return hash.digest("hex")
}

/**
 * Every file the binary is built from, relative to the package: the crate, the Rust that
 * builds it, cargo's own configuration, as its flags shape the binary, and the recipe
 * (scripts/recipe.ts), which picks each platform's target, merges macOS's and signs it.
 */
export const sourcePaths = async (folder = root): Promise<string[]> => {
  const under = async (directory: string, keep: (path: string) => boolean) =>
    (await readdir(join(folder, directory), { recursive: true }).catch(() => []))
      .filter(keep)
      .map((path) => join(directory, path))
  return [
    "Cargo.toml",
    "Cargo.lock",
    "rust-toolchain.toml",
    ...(await under("src", (path) => path.endsWith(".rs"))),
    ...(await under(".cargo", (path) => path.endsWith(".toml"))),
    join("scripts", "recipe.ts"),
  ]
}

const readSource = async (): Promise<string> => {
  const paths = await sourcePaths()
  return sourceHash(
    await Promise.all(
      paths.map(async (path) => ({ path, text: await readFile(join(root, path), "utf8") })),
    ),
  )
}

const readPrebuilt = async (): Promise<Prebuilt> =>
  JSON.parse(await readFile(join(root, "prebuilt.json"), "utf8")) as Prebuilt

// Replaced whole, so a runner reading it meanwhile sees the old binary or the new one.
const place = async (data: Uint8Array): Promise<void> => {
  const output = join(root, "dist", binaryName)
  await mkdir(join(root, "dist"), { recursive: true })
  const temporary = `${output}.${process.pid}.tmp`
  await writeFile(temporary, data, { mode: 0o755 })
  await rename(temporary, output)
  await chmod(output, 0o755)
}

const fromSource = async (why: string): Promise<void> => {
  if (!hasCargo()) {
    throw new Error(
      `${why}, so it is built from source, which needs Rust: install it from https://rustup.rs.`,
    )
  }
  await place(compile(await readSource()))
}

const download = async (prebuilt: Prebuilt, key: string): Promise<void> => {
  const pinned = prebuilt.files[key]
  if (!pinned) throw new Error(`No prebuilt relay for ${key}`)
  const current = await readFile(join(root, "dist", binaryName)).catch(() => undefined)
  if (current && sha256(current) === pinned.sha256) return
  const url = `${releases}/${prebuilt.release}/${assetName(key)}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Downloading ${url} failed: ${response.status}`)
  const data = new Uint8Array(await response.arrayBuffer())
  if (sha256(data) !== pinned.sha256) throw new Error(`${url} isn't the binary prebuilt.json pins`)
  await place(data)
}

export const build = async (): Promise<void> => {
  if (process.env.NOVADECK_RELAY_FROM_SOURCE === "1") {
    await fromSource("NOVADECK_RELAY_FROM_SOURCE is set")
    return
  }
  const [source, prebuilt] = await Promise.all([readSource(), readPrebuilt()])
  const key = target()
  if (prebuilt.source !== source || !prebuilt.release || !prebuilt.files[key]) {
    await fromSource(
      prebuilt.source === source
        ? `No prebuilt relay is pinned for ${key}`
        : "The relay's source isn't the one prebuilt.json pins",
    )
    return
  }
  try {
    await download(prebuilt, key)
  } catch (error) {
    // Offline, or behind a proxy Node's fetch doesn't use: Rust, where it's installed,
    // builds the same source.
    const why = error instanceof Error ? error.message : String(error)
    if (!hasCargo()) {
      throw new Error(
        `${why}. Without network access to GitHub, install Rust from https://rustup.rs and ` +
          "build from source with NOVADECK_RELAY_FROM_SOURCE=1.",
        { cause: error },
      )
    }
    console.warn(`${why}; building the relay from source instead.`)
    await fromSource("The prebuilt relay couldn't be downloaded")
  }
}

// The newest release published for `source`, by its tag.
const publishedFor = async (source: string): Promise<string> => {
  const headers = process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {}
  const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=100`, {
    headers,
  })
  if (!response.ok) throw new Error(`Listing the releases failed: ${response.status}`)
  const listed = (await response.json()) as readonly { readonly tag_name: string }[]
  const found = listed.find(({ tag_name }) => tag_name.startsWith(`${releasePrefix(source)}-`))
  if (!found) {
    throw new Error(
      `No release holds this source's binaries yet; the Relay workflow publishes them once ` +
        "it is pushed.",
    )
  }
  return found.tag_name
}

const pin = async (): Promise<void> => {
  const source = await readSource()
  const release = await publishedFor(source)
  const files: { [key: string]: { sha256: string } } = {}
  for (const key of targets) {
    const url = `${releases}/${release}/${assetName(key)}`
    // eslint-disable-next-line no-await-in-loop -- A few binaries, one after another.
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Downloading ${url} failed: ${response.status}`)
    // eslint-disable-next-line no-await-in-loop -- As above.
    files[key] = { sha256: sha256(new Uint8Array(await response.arrayBuffer())) }
  }
  const pinned: Prebuilt = { source, release, files }
  await writeFile(join(root, "prebuilt.json"), `${JSON.stringify(pinned, null, 2)}\n`)
}

/**
 * Whether the relay's own checks can run: building NovaDeck needs no Rust, so without it
 * they're skipped, saying so, except in CI, which always checks the relay.
 */
const withRust = (what: string): boolean => {
  if (hasCargo()) {
    pinnedRust()
    return true
  }
  if (process.env.CI || process.env.NOVADECK_RELAY_FROM_SOURCE === "1") {
    throw new Error(`The relay's ${what} need Rust, and cargo is missing.`)
  }
  console.log(`Skipping the relay's ${what}: Rust isn't installed.`)
  return false
}

/** The platforms clippy checks in CI, as each compiles code of its own. */
export const lintTriples = [
  "x86_64-unknown-linux-gnu",
  "aarch64-apple-darwin",
  "x86_64-pc-windows-msvc",
]

// Clippy for this platform, or in CI for every platform the relay ships for: checking
// needs no linker, so one runner checks them all.
const clippy = (...triple: string[]) =>
  run("cargo", [
    "clippy",
    "--locked",
    "--release",
    "--all-targets",
    ...triple,
    "--",
    "-D",
    "warnings",
  ])

const lint = (): void => {
  if (!process.env.CI) return clippy()
  run("rustup", ["target", "add", ...lintTriples])
  for (const triple of lintTriples) clippy("--target", triple)
}

export const main = async (args: readonly string[]): Promise<void> => {
  const [mode] = args
  if (mode === "--hash") {
    console.log(await readSource())
    return
  }
  if (mode === "--prefix") {
    console.log(releasePrefix(await readSource()))
    return
  }
  if (mode === "--check") {
    const [source, prebuilt] = await Promise.all([readSource(), readPrebuilt()])
    if (prebuilt.source === source) return
    throw new Error(
      "application/relay/prebuilt.json pins another version of the relay's source. Once " +
        "the Relay workflow has published binaries for this one, pin them with " +
        "`node application/relay/scripts/build.ts --pin` and commit prebuilt.json.",
    )
  }
  if (mode === "--asset") {
    console.log(assetName(target()))
    return
  }
  if (mode === "--pin") {
    await pin()
    return
  }
  if (mode === "--test") {
    // Its copy is also exercised through the runner's tests.
    if (withRust("tests")) run("cargo", ["test", "--locked"])
    return
  }
  if (mode === "--format" || mode === "--format-check") {
    if (withRust("formatting")) run("cargo", ["fmt", ...(mode === "--format" ? [] : ["--check"])])
    return
  }
  if (mode === "--lint") {
    if (withRust("lints")) lint()
    return
  }
  await build()
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
