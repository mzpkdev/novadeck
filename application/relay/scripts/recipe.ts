import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// How the relay is built from source on each platform. Its source's hash covers this
// file, as what it does shapes the binary; the rest of the tooling (scripts/build.ts) is
// left out, so changing how binaries are pinned or checked builds none again.

/** The relay's package. */
export const root = fileURLToPath(new URL("..", import.meta.url))

export const binaryName = process.platform === "win32" ? "novadeck-relay.exe" : "novadeck-relay"

/** Runs a command in the package, failing with it. */
export const run = (
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): void => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`)
}

export const hasCargo = (): boolean => !spawnSync("cargo", ["--version"], { stdio: "ignore" }).error

const hasRustup = (): boolean => !spawnSync("rustup", ["--version"], { stdio: "ignore" }).error

let rustInPlace = false
/**
 * Puts the Rust rust-toolchain.toml names in place, once, where rustup manages Rust: not
 * every rustup installs it by itself when cargo first runs.
 */
export const pinnedRust = (): void => {
  if (rustInPlace || !hasRustup()) return
  rustInPlace = true
  run("rustup", ["toolchain", "install", "--no-self-update"])
}

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

/**
 * The relay built from `source`, the hash of what it is built from, which it names when
 * asked its version: statically linked on Linux, and on macOS signed, and for both chips
 * with NOVADECK_RELAY_UNIVERSAL=1, as the universal app needs. Needs cargo.
 */
export const compile = (source: string): Buffer => {
  pinnedRust()
  const cargo = (...args: string[]) =>
    run("cargo", ["build", "--release", "--locked", ...args], {
      ...process.env,
      NOVADECK_RELAY_SOURCE: source,
    })
  // Without rustup, as with a distribution's own cargo, it links as that cargo does.
  if (process.platform === "linux" && hasRustup()) {
    const triple = linuxTriple()
    run("rustup", ["target", "add", triple])
    cargo("--target", triple)
    return readFileSync(join(root, "target", triple, "release", binaryName))
  }
  const universal = process.platform === "darwin" && process.env.NOVADECK_RELAY_UNIVERSAL === "1"
  if (!universal) {
    cargo()
    return signed(join(root, "target", "release", binaryName))
  }
  const triples = ["aarch64-apple-darwin", "x86_64-apple-darwin"]
  run("rustup", ["target", "add", ...triples])
  for (const triple of triples) cargo("--target", triple)
  const merged = join(root, "target", binaryName)
  run("lipo", [
    "-create",
    "-output",
    merged,
    ...triples.map((triple) => join(root, "target", triple, "release", binaryName)),
  ])
  return signed(merged)
}
