import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { chmod, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// `pnpm build` for the relay: the prebuilt binary for this platform when the source is
// the one `prebuilt.json` pins, so building NovaDeck needs no Rust; otherwise, as when
// someone changed the relay, built from source with cargo.
//
//   node scripts/build.ts           builds dist/novadeck-relay[.exe]
//   node scripts/build.ts --test    runs the relay's own tests, where cargo is installed
//   node scripts/build.ts --hash    prints the source's hash
//   node scripts/build.ts --check   fails when prebuilt.json pins another source
//   node scripts/build.ts --asset   prints this platform's binary's name in a release
//   node scripts/build.ts --pin     pins the binaries the Relay workflow published for
//                                   this source, writing prebuilt.json
//
// NOVADECK_RELAY_FROM_SOURCE=1 always builds from source, as CI does to keep it honest;
// NOVADECK_RELAY_UNIVERSAL=1 on macOS builds both architectures into one binary, as the
// universal app needs.

const root = fileURLToPath(new URL("..", import.meta.url))
const releases = "https://github.com/mzpkdev/novadeck/releases/download"

/** The binaries published for one version of the relay's source, by target. */
export type Prebuilt = {
  readonly source: string
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

/** Where a source version's binaries are published. */
export const releaseTag = (source: string): string => `relay-${source.slice(0, 16)}`

const binaryName = process.platform === "win32" ? "novadeck-relay.exe" : "novadeck-relay"

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
 * Every file the binary is built from, relative to the package: the crate, cargo's own
 * configuration, as its flags shape the binary, and this script, which picks each
 * platform's target, merges macOS's and signs it.
 */
export const sourcePaths = async (folder = root): Promise<string[]> => {
  const under = async (directory: string, keep: (path: string) => boolean) =>
    (await readdir(join(folder, directory), { recursive: true }).catch(() => []))
      .filter(keep)
      .map((path) => join(directory, path))
  return [
    "Cargo.toml",
    "Cargo.lock",
    ...(await under("src", (path) => path.endsWith(".rs"))),
    ...(await under(".cargo", (path) => path.endsWith(".toml"))),
    join("scripts", "build.ts"),
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

const run = (command: string, args: readonly string[]): void => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`)
}

const hasCargo = (): boolean => !spawnSync("cargo", ["--version"], { stdio: "ignore" }).error

// Apple silicon runs only signed code, and stripping or merging architectures can leave a
// binary's own signature broken, so on macOS it is signed again, ad hoc, as the unsigned
// app is. Returns its bytes.
const signed = (path: string): Buffer => {
  if (process.platform === "darwin") run("codesign", ["--force", "--sign", "-", path])
  return readFileSync(path)
}

/**
 * On Linux, the Rust target the relay is built for: linked statically against musl, so
 * one binary runs on any distribution, however old its C library, as a server's may be.
 */
export const linuxTriple = (arch: string = process.arch): string =>
  `${arch === "arm64" ? "aarch64" : "x86_64"}-unknown-linux-musl`

const hasRustup = (): boolean => !spawnSync("rustup", ["--version"], { stdio: "ignore" }).error

const fromSource = async (why: string): Promise<void> => {
  if (!hasCargo()) {
    throw new Error(
      `${why}, so it is built from source, which needs Rust: install it from https://rustup.rs.`,
    )
  }
  // Without rustup, as with a distribution's own cargo, it links as that cargo does.
  if (process.platform === "linux" && hasRustup()) {
    const triple = linuxTriple()
    run("rustup", ["target", "add", triple])
    run("cargo", ["build", "--release", "--locked", "--target", triple])
    await place(await readFile(join(root, "target", triple, "release", binaryName)))
    return
  }
  const universal = process.platform === "darwin" && process.env.NOVADECK_RELAY_UNIVERSAL === "1"
  if (!universal) {
    run("cargo", ["build", "--release", "--locked"])
    await place(signed(join(root, "target", "release", binaryName)))
    return
  }
  const triples = ["aarch64-apple-darwin", "x86_64-apple-darwin"]
  run("rustup", ["target", "add", ...triples])
  for (const triple of triples) run("cargo", ["build", "--release", "--locked", "--target", triple])
  const merged = join(root, "target", binaryName)
  run("lipo", [
    "-create",
    "-output",
    merged,
    ...triples.map((triple) => join(root, "target", triple, "release", binaryName)),
  ])
  await place(signed(merged))
}

const download = async (prebuilt: Prebuilt, key: string): Promise<void> => {
  const pinned = prebuilt.files[key]
  if (!pinned) throw new Error(`No prebuilt relay for ${key}`)
  const current = await readFile(join(root, "dist", binaryName)).catch(() => undefined)
  if (current && sha256(current) === pinned.sha256) return
  const url = `${releases}/${releaseTag(prebuilt.source)}/${assetName(key)}`
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
  if (prebuilt.source !== source || !prebuilt.files[key]) {
    await fromSource(
      prebuilt.source === source
        ? `No prebuilt relay is pinned for ${key}`
        : "The relay's source isn't the one prebuilt.json pins",
    )
    return
  }
  await download(prebuilt, key)
}

const pin = async (): Promise<void> => {
  const source = await readSource()
  const files: { [key: string]: { sha256: string } } = {}
  for (const key of targets) {
    const url = `${releases}/${releaseTag(source)}/${assetName(key)}`
    // eslint-disable-next-line no-await-in-loop -- Three binaries, one after another.
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(
        `Downloading ${url} failed: ${response.status}. The Relay workflow publishes it ` +
          "once this source is pushed.",
      )
    }
    // eslint-disable-next-line no-await-in-loop -- As above.
    files[key] = { sha256: sha256(new Uint8Array(await response.arrayBuffer())) }
  }
  const pinned: Prebuilt = { source, files }
  await writeFile(join(root, "prebuilt.json"), `${JSON.stringify(pinned, null, 2)}\n`)
}

export const main = async (args: readonly string[]): Promise<void> => {
  const [mode] = args
  if (mode === "--hash") {
    console.log(await readSource())
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
    // Building NovaDeck needs no Rust; testing the relay itself does, as CI has.
    if (hasCargo()) run("cargo", ["test", "--locked"])
    else if (process.env.NOVADECK_RELAY_FROM_SOURCE === "1") throw new Error("cargo is missing")
    else console.log("Skipping the relay's own tests: Rust isn't installed.")
    // Its copy is also exercised through the runner's tests.
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
