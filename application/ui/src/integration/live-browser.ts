import { randomBytes } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer as createPortServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { chromium, type Page } from "playwright"
import { createServer } from "vite"

import { startRuntime } from "../../../runtime/src/terminal-server"
import { createRuntimeConnection } from "../services/runtime-connection"

const uiRoot = fileURLToPath(new URL("../..", import.meta.url))
const unusedPort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createPortServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") return reject(new Error("No free test port"))
      const port = address.port
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })

export const startLiveBrowser = async () => {
  const directory = await mkdtemp(join(tmpdir(), "novadeck-live-"))
  const artifacts = join(tmpdir(), "novadeck-runtime-integration", "live-browser")
  await mkdir(artifacts, { recursive: true })
  const token = randomBytes(32).toString("hex")
  const port = await unusedPort()
  const origin = `http://127.0.0.1:${port}`
  const errors: string[] = []
  const urls: string[] = []
  const sockets: string[] = []
  let onNextConnection: (() => void) | undefined
  const runtime = await startRuntime({
    port: 0,
    apiToken: token,
    corsOrigins: [origin],
    databasePath: join(directory, "metadata.sqlite"),
    terminal: {
      shell: process.platform === "win32" ? (process.env.COMSPEC ?? "cmd.exe") : "/bin/sh",
      shellArgs: [],
      env: { NOVADECK_LIVE_OUTPUT: "NOVADECK_REAL_PTY_READY" },
    },
  })
  const inspector = createRuntimeConnection()
  let vite: Awaited<ReturnType<typeof createServer>> | undefined
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  const redact = (message: string) => message.replaceAll(token, "[test credential]")
  const save = async (page: Page, name: string): Promise<void> => {
    await page.screenshot({ path: join(artifacts, `${name}.png`), fullPage: true })
    const diagnostic = await page.evaluate(() => {
      const terminal = document.querySelector("[data-terminal]")
      if (!terminal) return null
      const box = terminal.getBoundingClientRect()
      const point = { x: box.x + box.width / 2, y: box.bottom - 15 }
      let element = document.elementFromPoint(point.x, point.y)
      const ancestors = []
      while (element && ancestors.length < 6) {
        const style = getComputedStyle(element)
        const bounds = element.getBoundingClientRect()
        ancestors.push({
          tag: element.tagName,
          class: element.className,
          box: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
          background: style.backgroundColor,
          border: style.border,
          before: getComputedStyle(element, "::before").backgroundColor,
          after: getComputedStyle(element, "::after").backgroundColor,
          html: element.outerHTML.slice(0, 500),
        })
        element = element.parentElement
      }
      return { point, ancestors }
    })
    await writeFile(
      join(artifacts, `${name}-dom.json`),
      redact(JSON.stringify(diagnostic, null, 2)),
    )
    await writeFile(
      join(artifacts, `${name}.txt`),
      redact(
        (await page.locator("body").innerText()) +
          "\n\nTerminal accessibility buffer:\n" +
          (await page.locator(".xterm-accessibility-tree").allTextContents()).join("\n"),
      ),
    )
  }
  const close = async (): Promise<void> => {
    inspector.dispose()
    try {
      await browser?.close()
    } finally {
      try {
        await vite?.close()
      } finally {
        try {
          await runtime.close()
        } finally {
          await rm(directory, { recursive: true, force: true })
        }
      }
    }
    await writeFile(
      join(artifacts, "browser.json"),
      JSON.stringify(
        {
          errors: errors.map(redact),
          urls: urls.map(redact),
          socketConnections: sockets.length,
        },
        null,
        2,
      ),
    )
  }
  try {
    await inspector.connect({ url: `${runtime.origin.replace(/^http/, "ws")}/api/rpc`, token })
    vite = await createServer({
      root: uiRoot,
      logLevel: "error",
      define: { "import.meta.env.VITE_API_URL": JSON.stringify("/api") },
      server: {
        host: "127.0.0.1",
        port,
        strictPort: true,
        proxy: { "/api": { target: runtime.origin, ws: true } },
      },
    })
    await vite.listen()
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    page.on("pageerror", (error) => errors.push(redact(error.message)))
    page.on("request", (request) => urls.push(request.url()))
    await page.addInitScript(() => {
      const runtimeSockets: WebSocket[] = []
      Object.assign(window, { novadeckLiveSockets: runtimeSockets })
      const NativeWebSocket = window.WebSocket
      // Keep the real browser transport and capture its public close() seam.
      // No frames, authentication or terminal output are mocked or replaced.
      window.WebSocket = new Proxy(NativeWebSocket, {
        construct(target, args) {
          const socket = Reflect.construct(target, args) as WebSocket
          if (new URL(socket.url).pathname === "/api/rpc") runtimeSockets.push(socket)
          return socket
        },
      })
    })
    page.on("websocket", (socket) => {
      if (new URL(socket.url()).pathname !== "/api/rpc") return
      sockets.push(socket.url())
      urls.push(socket.url())
      onNextConnection?.()
      onNextConnection = undefined
    })
    return {
      page,
      inspect: () => inspector.getClient(),
      token,
      directory,
      origin,
      errors,
      urls,
      sockets,
      save,
      close,
      savePlacement: (value: unknown) =>
        writeFile(join(artifacts, "canvas-creation.json"), JSON.stringify(value, null, 2)),
      nextConnection: () =>
        new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            onNextConnection = undefined
            reject(new Error("Runtime transport did not reconnect"))
          }, 10_000)
          onNextConnection = () => {
            clearTimeout(timer)
            resolve()
          }
        }),
    }
  } catch (error) {
    await close()
    throw error
  }
}
