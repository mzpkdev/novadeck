import { describe, expect, it } from "vitest"

import {
  assetName,
  linuxTriple,
  releasePrefix,
  sourceHash,
  sourcePaths,
  target,
  targets,
} from "./build.ts"

describe("the relay's build", () => {
  it("hashes the source by each file's path and content, whatever the order or line endings", () => {
    const files = [
      { path: "src/main.rs", text: "fn main() {}\n" },
      { path: "Cargo.toml", text: "[package]\n" },
    ]
    const hash = sourceHash(files)
    expect(sourceHash(files.toReversed())).toBe(hash)
    expect(
      sourceHash(files.map((file) => ({ ...file, text: file.text.replaceAll("\n", "\r\n") }))),
    ).toBe(hash)
    expect(sourceHash([{ path: "src\\main.rs", text: "fn main() {}\n" }, files[1]!])).toBe(hash)
    expect(sourceHash([{ path: "src/main.rs", text: "fn main() { }\n" }, files[1]!])).not.toBe(hash)
    expect(sourceHash([{ path: "src/lib.rs", text: "fn main() {}\n" }, files[1]!])).not.toBe(hash)
  })

  it("publishes one binary for each platform the app ships for, macOS's for both chips", () => {
    expect(target("linux", "x64")).toBe("linux-x64")
    expect(target("linux", "arm64")).toBe("linux-arm64")
    expect(target("darwin", "arm64")).toBe("darwin-universal")
    expect(target("darwin", "x64")).toBe("darwin-universal")
    expect(target("win32", "x64")).toBe("win32-x64")
    expect(targets.map(assetName)).toEqual([
      "novadeck-relay-linux-x64",
      "novadeck-relay-linux-arm64",
      "novadeck-relay-darwin-universal",
      "novadeck-relay-win32-x64.exe",
    ])
    expect(releasePrefix("0123456789abcdef0123")).toBe("relay-0123456789abcdef")
  })

  it("links Linux binaries statically, so one runs on any distribution", () => {
    expect(linuxTriple("x64")).toBe("x86_64-unknown-linux-musl")
    expect(linuxTriple("arm64")).toBe("aarch64-unknown-linux-musl")
  })

  it("hashes what shapes the binary: the crate, cargo's flags and this build", async () => {
    const paths = (await sourcePaths()).map((path) => path.replaceAll("\\", "/"))
    expect(paths).toEqual(
      expect.arrayContaining([
        "Cargo.toml",
        "Cargo.lock",
        "src/main.rs",
        ".cargo/config.toml",
        "scripts/build.ts",
      ]),
    )
    expect(paths.some((path) => path.startsWith("target/") || path.startsWith("dist/"))).toBe(false)
  })
})
