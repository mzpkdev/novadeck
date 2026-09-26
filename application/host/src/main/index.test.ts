import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { context, describe, expect, it } from "../test"

const output = join(process.cwd(), "out")
const read = (path: string): Promise<string> => readFile(join(output, path), "utf8")

describe("compiled desktop host", () => {
  context("after the production build", () => {
    it("keeps the application identity and starts the embedded runtime", async () => {
      const main = await read("main/index.js")
      const preload = await read("preload/index.cjs")

      expect(main).toContain('const appId = "dev.mzpk.novadeck"')
      expect(main).toContain("startRuntime")
      expect(main).toContain("port: 0")
      expect(main).toContain('randomBytes(32).toString("hex")')
      expect(main).toContain('app.getPath("userData")')
      expect(main).toContain('"workspace.sqlite"')
      expect(main).toContain("apiToken: token")
      expect(main).toContain('join(process.resourcesPath, "ui", "index.html")')
      expect(main).toContain("loadFile")
      expect(main).toContain("additionalArguments")
      expect(preload).toContain('exposeInMainWorld("novadeck"')
      expect(preload).toContain("127.0.0.1")
      expect(preload).toContain("getRuntimeConnection")
      expect(preload).toContain("ipcRenderer.invoke(runtimeConnectionChannel)")
      expect(preload).not.toContain("apiToken")
    })

    it("keeps the native PTY dependency external and emits the terminal service", async () => {
      const chunks = await import("node:fs/promises").then(({ readdir }) =>
        readdir(join(output, "main"), { recursive: true }),
      )
      const sources = await Promise.all(
        chunks.filter((file) => file.endsWith(".js")).map((file) => read(`main/${file}`)),
      )
      expect(sources.some((source) => source.includes('from "node-pty"'))).toBe(true)
      expect(sources.some((source) => source.includes('from "ws"'))).toBe(true)
      expect(sources.some((source) => source.includes("/api/rpc"))).toBe(true)
      expect(sources.some((source) => source.includes('from "node:sqlite"'))).toBe(true)
    })

    it("blocks renderer navigation and denies permissions by default", async () => {
      const main = await read("main/index.js")

      expect(main).toContain('webContents.on("will-navigate"')
      expect(main).toContain("setPermissionCheckHandler")
      expect(main).toContain("setPermissionRequestHandler")
      expect(main).toContain("event.sender.mainFrame")
      expect(main).toContain("trustedWindows.get(event.sender.id)")
      expect(main).toContain("isTrustedFrame")
    })
  })
})
