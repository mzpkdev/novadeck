import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

import { context, describe, expect, it } from "../../test"
import { chooseMode, findTool, parseRequest, sudoArgs, type Tools, userArgs } from "./isolated.ts"

const tools: Tools = {
  unshare: "/usr/bin/unshare",
  ip: "/usr/sbin/ip",
  setpriv: "/usr/bin/setpriv",
  sh: "/bin/sh",
}
const user = { uid: 1001, gid: 118, groups: [118, 4] }

describe("isolated", () => {
  context("when asked to run a command", () => {
    it("takes everything after -- as the command, flags and all", () => {
      expect(parseRequest(["--", "pnpm", "--filter", "x", "test"])).toEqual({
        kind: "run",
        command: ["pnpm", "--filter", "x", "test"],
      })
    })

    it("refuses to run nothing", () => {
      expect(parseRequest(["--"])).toBeInstanceOf(Error)
    })
  })

  context("when choosing how to make the namespace", () => {
    it("uses sudo where it needs no password, and an unprivileged namespace elsewhere", () => {
      expect(chooseMode(undefined, () => true)).toBe("sudo")
      expect(chooseMode(undefined, () => false)).toBe("user")
    })

    it("does what NOVADECK_E2E_NETNS asks, and refuses a mode it doesn't know", () => {
      expect(chooseMode("user", () => true)).toBe("user")
      expect(chooseMode("root", () => true)).toBeInstanceOf(Error)
    })
  })

  context("when finding a program root will run", () => {
    it("takes the system's copy over one on PATH", () => {
      const found = findTool("unshare", "/home/linuxbrew/.linuxbrew/bin:/usr/bin", () => true)
      expect(found).toBe("/usr/bin/unshare")
    })

    it("never takes a relative folder on PATH", () => {
      const found = findTool("ip", "bin:/opt/tools", (file) => !file.startsWith("/usr"))
      expect(found).toBe("/bin/ip")
      expect(findTool("ip", "bin", (file) => file === "bin/ip")).toBeUndefined()
    })
  })

  context("through sudo", () => {
    const args = sudoArgs(tools, user, ["/usr/bin/node", "main.ts", "--restore", "/tmp/e/env.json"])

    it("hands the command back to the user, with their groups, before it runs", () => {
      const setpriv = args.indexOf(tools.setpriv)
      expect(args.slice(setpriv, setpriv + 4)).toEqual([
        "/usr/bin/setpriv",
        "--reuid=1001",
        "--regid=118",
        "--groups=118,4",
      ])
      expect(args.indexOf("/usr/bin/node")).toBeGreaterThan(setpriv)
    })

    it("never asks for a password", () => {
      expect(args[0]).toBe("-n")
    })
  })

  context("without root", () => {
    it("maps the user back to their own ids for the command", () => {
      const args = userArgs(tools, user, ["true"])
      expect(args).toContain("--map-user=1001")
      expect(args).toContain("--map-group=118")
      expect(args.at(-1)).toBe("true")
    })
  })
})

const main = fileURLToPath(new URL("main.ts", import.meta.url))
const isolated = (command: readonly string[], env: NodeJS.ProcessEnv = process.env) =>
  spawnSync(process.execPath, [main, "--", ...command], { env, encoding: "utf8", timeout: 20_000 })

// Opt-in only (`NOVADECK_E2E_NETNS_TESTS=1`, set by the E2E workflow): making a namespace
// may run sudo, which the normal suite must never do on a developer's machine or a
// runner. Even the check for whether one can be made runs only once opted in.
const optedIn = process.env.NOVADECK_E2E_NETNS_TESTS === "1"
const available = optedIn && process.platform === "linux" && isolated(["true"]).status === 0

// What a program inside sees: whether a loopback server answers, and how a connection to
// a public address fails.
const probe = `
const http = require("node:http")
const net = require("node:net")
const server = http.createServer((_, res) => res.end("ok")).listen(0, "127.0.0.1", async () => {
  const loopback = (await fetch("http://127.0.0.1:" + server.address().port)).status
  server.close()
  const socket = net.connect(80, "1.1.1.1")
  socket.on("connect", () => { console.log(JSON.stringify({ loopback, out: "connected" })); socket.destroy() })
  socket.on("error", (error) => console.log(JSON.stringify({ loopback, out: error.code })))
})
`

describe.skipIf(!available)("isolated, in a real namespace", () => {
  it("lets loopback answer and gives nothing else a route", () => {
    const result = isolated([process.execPath, "-e", probe])
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ loopback: 200, out: "ENETUNREACH" })
  })

  it("runs the command as the user, with their environment", () => {
    const result = isolated(["sh", "-c", 'echo "$(id -u) $ISOLATED_MARKER"'], {
      ...process.env,
      ISOLATED_MARKER: "kept",
    })
    expect(result.stdout.trim()).toBe(`${process.getuid?.()} kept`)
  })

  it("exits as the command does", () => {
    expect(isolated(["sh", "-c", "exit 7"]).status).toBe(7)
  })
})
