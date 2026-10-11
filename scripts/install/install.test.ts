import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { afterEach } from "vitest"

import { context, describe, expect, it } from "../test"

const script = readFileSync(fileURLToPath(new URL("./install.sh", import.meta.url)), "utf8")

// The script is for Linux, and the tests stand in for the machine with a PATH of shims
// and the few real tools it needs, so which tools exist is theirs to choose.
const linux = process.platform === "linux"

const tools = [
  "awk",
  "cat",
  "chmod",
  "cp",
  "grep",
  "ln",
  "mkdir",
  "mktemp",
  "mv",
  "rm",
  "sha256sum",
]

const download = "novadeck-linux-x86_64.AppImage"
const image = "novadeck.AppImage"
const profileSource = "@{HOME}/{.local/share/novadeck,Applications}/novadeck.AppImage"

const sha256 = (content: string) => createHash("sha256").update(content).digest("hex")

const shim = (folder: string, name: string, body: string) => {
  const path = join(folder, name)
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
}

// An AppImage that answers the one option the installer uses, the way the real one
// unpacks part of itself without FUSE.
const appImage = `#!/bin/sh
if [ "$1" = --appimage-extract ]; then
  mkdir -p squashfs-root/usr/share/icons/hicolor/512x512/apps
  printf png > squashfs-root/usr/share/icons/hicolor/512x512/apps/novadeck.png
fi
`

type Scenario = {
  args?: string[]
  uname?: { system?: string; machine?: string }
  root?: boolean
  /** Whether sudo exists, or "denied" when it does but refuses to run anything. */
  sudo?: boolean | "denied"
  /** Replaces the content a download is checked against, to fake a corrupt file. */
  tamper?: string
  script?: string
  /** The value of apparmor_restrict_unprivileged_userns; the file is absent when unset. */
  restrict?: "0" | "1"
  /** apparmor_parser on the fake computer, which "rejects" every dry run when "invalid". */
  parser?: "valid" | "invalid"
  /** Moves the data folder, as XDG_DATA_HOME does, to this folder inside the test's. */
  xdg?: string
  /** Tools present on the PATH, such as fusermount3. */
  extra?: string[]
  /** Tools present only in the system folders a user's PATH lacks. */
  sbin?: string[]
  /** Pretends /dev/fuse exists. */
  fuseDevice?: boolean
  /** Leaves the download folder unset, so the script builds it from its repository. */
  rendered?: boolean
}

const folders: string[] = []

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

const run = (scenario: Scenario = {}) => {
  const root = mkdtempSync(join(tmpdir(), "novadeck-install-"))
  folders.push(root)
  const bin = join(root, "bin")
  const served = join(root, "served")
  const home = join(root, "home")
  const apparmor = join(root, "apparmor.d")
  const log = join(root, "log")
  for (const folder of [bin, served, home, apparmor]) mkdirSync(folder)
  writeFileSync(log, "")

  const files: Record<string, string> = { [download]: appImage }
  for (const [name, content] of Object.entries(files)) writeFileSync(join(served, name), content)
  writeFileSync(
    join(served, "SHA256SUMS"),
    Object.entries(files)
      .map(([name, content]) => `${sha256(scenario.tamper ?? content)}  ${name}`)
      .join("\n") + "\n",
  )

  for (const tool of tools) {
    symlinkSync(["/usr/bin", "/bin"].map((d) => join(d, tool)).find(existsSync)!, join(bin, tool))
  }
  const { system = "Linux", machine = "x86_64" } = scenario.uname ?? {}
  shim(bin, "uname", `[ "$1" = -s ] && echo ${system} || echo ${machine}`)
  shim(bin, "id", `echo ${scenario.root ? 0 : 1000}`)
  shim(
    bin,
    "curl",
    `while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift ;; http*) url="$1" ;; esac; shift; done
echo "curl $url" >> "${log}"
cp "${served}/\${url##*/}" "$out"`,
  )
  const sudo = scenario.sudo ?? true
  if (sudo === "denied") shim(bin, "sudo", `echo "sudo denied" >> "${log}"; exit 1`)
  else if (sudo) shim(bin, "sudo", `SUDO=sudo "$@"`)

  // The system folders the script searches are the test's own, so the host's tools never leak in.
  const sbin = join(root, "sbin")
  mkdirSync(sbin)
  for (const name of scenario.extra ?? []) shim(bin, name, `echo "${name} $*" >> "${log}"`)
  for (const name of scenario.sbin ?? []) shim(sbin, name, `echo "${name} $*" >> "${log}"`)
  if (scenario.parser) {
    // A dry run is the only call without --replace; it leaves a line in the log too.
    shim(
      bin,
      "apparmor_parser",
      `echo "\${SUDO:+sudo }apparmor_parser $*" >> "${log}"
case "$*" in *--skip-kernel-load*) [ "${scenario.parser}" = valid ] ;; esac`,
    )
  }
  const sysctl = join(root, "restrict")
  if (scenario.restrict) writeFileSync(sysctl, `${scenario.restrict}\n`)
  const device = join(root, "fuse")
  if (scenario.fuseDevice ?? true) writeFileSync(device, "")

  const text = (scenario.script ?? script).replaceAll("@REPOSITORY@", "acme/novadeck")
  const entry = join(root, "install.sh")
  writeFileSync(entry, text)
  const data = scenario.xdg ? join(root, scenario.xdg) : undefined
  const start = () =>
    spawnSync("/bin/sh", [entry, ...(scenario.args ?? [])], {
      env: {
        PATH: bin,
        HOME: home,
        NOVADECK_INSTALL_SBIN_DIRS: sbin,
        NOVADECK_INSTALL_USERNS_SYSCTL: sysctl,
        NOVADECK_INSTALL_APPARMOR_DIR: apparmor,
        NOVADECK_INSTALL_FUSE_DEVICE: device,
        ...(data ? { XDG_DATA_HOME: data } : {}),
        ...(scenario.rendered ? {} : { NOVADECK_INSTALL_BASE_URL: `http://mirror.test/dl/` }),
      },
      encoding: "utf8",
    })
  const result = start()
  const lines = readFileSync(log, "utf8").split("\n").filter(Boolean)
  const profile = join(apparmor, "novadeck")
  return {
    ...result,
    home,
    data: data ?? join(home, ".local/share"),
    lines,
    commands: lines.filter((line) => !line.startsWith("curl")),
    profile: existsSync(profile) ? readFileSync(profile, "utf8") : undefined,
    profilePath: profile,
    again: start,
  }
}

describe.skipIf(!linux)("install.sh", () => {
  context("on any Linux system", () => {
    it("installs the AppImage with a menu entry, an icon and a command after checking its checksum", () => {
      const result = run()
      const target = join(result.data, "novadeck", image)
      expect(result.status).toBe(0)
      expect(result.lines).toContain("curl http://mirror.test/dl/SHA256SUMS")
      expect(result.lines).toContain(`curl http://mirror.test/dl/${download}`)
      expect(result.commands).toEqual([])
      expect(lstatSync(target).mode & 0o111).not.toBe(0)
      expect(readlinkSync(join(result.home, ".local/bin/novadeck"))).toBe(target)
      expect(
        readFileSync(join(result.data, "icons/hicolor/512x512/apps/novadeck.png"), "utf8"),
      ).toBe("png")
      const entry = readFileSync(
        join(result.data, "applications/dev.mzpk.novadeck.desktop"),
        "utf8",
      )
      expect(entry).toContain(`Exec="${target}" %U`)
      expect(entry).toContain(
        `Icon=${join(result.data, "icons/hicolor/512x512/apps/novadeck.png")}`,
      )
    })

    it("says when ~/.local/bin is not on the PATH", () => {
      const result = run()
      expect(result.stdout).toContain("to your PATH")
    })

    it("replaces the installed AppImage when run again", () => {
      const result = run()
      const target = join(result.home, ".local/share/novadeck", image)
      writeFileSync(target, "old")
      expect(result.again().status).toBe(0)
      expect(readFileSync(target, "utf8")).toBe(appImage)
    })

    it("installs under XDG_DATA_HOME when it is set", () => {
      const result = run({ xdg: "xdg" })
      expect(existsSync(join(result.data, "novadeck", image))).toBe(true)
    })
  })

  context("when checking for FUSE", () => {
    it("says nothing when fusermount3 and /dev/fuse exist", () => {
      expect(run({ extra: ["fusermount3"] }).stdout).not.toContain("FUSE")
    })

    it("accepts fusermount, which FUSE 2 systems have", () => {
      expect(run({ extra: ["fusermount"] }).stdout).not.toContain("FUSE")
    })

    it("finds fusermount3 in the system folders when the PATH lacks it", () => {
      expect(run({ sbin: ["fusermount3"] }).stdout).not.toContain("FUSE")
    })

    it("explains when there is no fusermount", () => {
      const result = run()
      expect(result.status).toBe(0)
      expect(result.stdout).toContain("needs FUSE 3")
      expect(result.stdout).toContain("fuse3")
      expect(result.stdout).toContain("--appimage-extract-and-run")
    })

    it("explains when there is no /dev/fuse", () => {
      const result = run({ extra: ["fusermount3"], fuseDevice: false })
      expect(result.stdout).toContain("needs FUSE 3")
    })
  })

  context("on a system that restricts unprivileged user namespaces", () => {
    const restricted = { restrict: "1", parser: "valid" } as const

    it("installs an AppArmor profile through sudo and loads it", () => {
      const result = run(restricted)
      expect(result.status).toBe(0)
      expect(result.stdout).toContain("so Novadeck's sandbox works on this system")
      expect(result.commands).toHaveLength(2)
      expect(result.commands[0]).toMatch(/^apparmor_parser --skip-kernel-load --debug \S+$/)
      expect(result.commands[1]).toBe(`sudo apparmor_parser --replace ${result.profilePath}`)
      expect(result.profile).toBe(`abi <abi/4.0>,
include <tunables/global>

profile novadeck ${profileSource} flags=(unconfined) {
  userns,
  include if exists <local/novadeck>
}
`)
    })

    it("skips sudo for root", () => {
      const result = run({ ...restricted, root: true, sudo: false })
      expect(result.commands[1]).toBe(`apparmor_parser --replace ${result.profilePath}`)
      expect(result.profile).toContain("userns,")
    })

    it("finds apparmor_parser in the system folders when the PATH lacks it", () => {
      const result = run({ restrict: "1", sbin: ["apparmor_parser"] })
      expect(result.commands).toHaveLength(2)
      expect(result.profile).toContain("userns,")
    })

    it("covers an install moved by XDG_DATA_HOME", () => {
      const result = run({ ...restricted, xdg: "xdg" })
      expect(result.profile).toContain(`profile novadeck ${profileSource}`)
      expect(result.profile).toContain(
        `profile novadeck-custom "${join(result.data, "novadeck", image)}" flags=(unconfined)`,
      )
    })

    it("leaves the install working and says how to retry when sudo refuses", () => {
      const result = run({ ...restricted, sudo: "denied" })
      expect(result.status).toBe(0)
      expect(result.profile).toBeUndefined()
      expect(result.stdout).toContain("without its sandbox")
      expect(result.stdout).toContain(
        "curl -fsSL http://mirror.test/dl/install.sh | sh -s -- --sandbox",
      )
      expect(existsSync(join(result.home, ".local/bin/novadeck"))).toBe(true)
    })

    it("leaves the install working when there is neither root nor sudo", () => {
      const result = run({ ...restricted, sudo: false })
      expect(result.status).toBe(0)
      expect(result.stdout).toContain("without its sandbox")
    })

    it("writes nothing when the dry run rejects the profile", () => {
      const result = run({ restrict: "1", parser: "invalid" })
      expect(result.status).toBe(0)
      expect(result.profile).toBeUndefined()
      expect(result.commands).toHaveLength(1)
      expect(result.stdout).toContain("without its sandbox")
    })

    it("warns instead of writing a profile for a path it cannot name", () => {
      const result = run({ ...restricted, xdg: "odd{path" })
      expect(result.status).toBe(0)
      expect(result.profile).toBeUndefined()
      expect(result.stdout).toContain("without its sandbox")
    })

    it("does nothing without apparmor_parser", () => {
      const result = run({ restrict: "1" })
      expect(result.status).toBe(0)
      expect(result.profile).toBeUndefined()
      expect(result.stdout).not.toContain("sandbox")
    })
  })

  context("on a system that does not restrict unprivileged user namespaces", () => {
    it.each([{ restrict: "0" }, {}] as const)("writes no profile with %j", (restrict) => {
      const result = run({ ...restrict, parser: "valid" })
      expect(result.status).toBe(0)
      expect(result.commands).toEqual([])
      expect(result.profile).toBeUndefined()
      expect(result.stdout).not.toContain("sandbox")
    })
  })

  context("with --sandbox", () => {
    it("sets up the sandbox and downloads and installs nothing", () => {
      const result = run({ args: ["--sandbox"], restrict: "1", parser: "valid" })
      expect(result.status).toBe(0)
      expect(result.lines).toEqual(result.commands)
      expect(result.commands).toHaveLength(2)
      expect(result.profile).toContain("userns,")
      expect(existsSync(join(result.home, ".local"))).toBe(false)
    })

    it("works without curl", () => {
      const result = run({
        args: ["--sandbox"],
        restrict: "1",
        parser: "valid",
        script: script.replace('has curl || fail "curl is required."', 'fail "curl asked for"'),
      })
      expect(result.status).toBe(0)
      expect(result.profile).toContain("userns,")
    })

    it("says when the system needs no setup", () => {
      const result = run({ args: ["--sandbox"], restrict: "0", parser: "valid" })
      expect(result.status).toBe(0)
      expect(result.stdout).toContain("needs no setup")
      expect(result.profile).toBeUndefined()
    })

    it("warns with the same command when sudo refuses", () => {
      const result = run({ args: ["--sandbox"], restrict: "1", parser: "valid", sudo: "denied" })
      expect(result.status).toBe(0)
      expect(result.stdout).toContain("--sandbox")
    })
  })

  context("with an unknown argument", () => {
    it("prints the usage and installs nothing", () => {
      const result = run({ args: ["--nope"] })
      expect(result.status).toBe(2)
      expect(result.stderr).toContain("usage: install.sh [--sandbox]")
      expect(result.lines).toEqual([])
    })
  })

  context("when a download does not match its checksum", () => {
    it("installs nothing", () => {
      const result = run({ tamper: "something else", restrict: "1", parser: "valid" })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain("does not match its checksum")
      expect(result.commands).toEqual([])
      expect(existsSync(join(result.home, ".local/bin/novadeck"))).toBe(false)
    })
  })

  context("on another platform", () => {
    it("points macOS to the disk image and downloads nothing", () => {
      const result = run({ uname: { system: "Darwin" } })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(
        "acme/novadeck/releases/latest/download/novadeck-mac-universal.dmg",
      )
      expect(result.lines).toEqual([])
    })

    it("refuses other architectures", () => {
      const result = run({ uname: { machine: "aarch64" } })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain("x86_64 only")
      expect(result.lines).toEqual([])
    })
  })

  context("when it is rendered for a repository", () => {
    it("downloads from that repository's latest release", () => {
      const result = run({ rendered: true })
      expect(result.lines[0]).toBe(
        "curl https://github.com/acme/novadeck/releases/latest/download/SHA256SUMS",
      )
    })
  })

  context("when the download is cut short", () => {
    it.each([0.3, 0.6, 0.99])("runs nothing at %s of the script", (share: number) => {
      const result = run({
        restrict: "1",
        parser: "valid",
        script: script.slice(0, Math.floor(script.length * share)),
      })
      expect(result.lines).toEqual([])
      expect(result.profile).toBeUndefined()
    })
  })
})
