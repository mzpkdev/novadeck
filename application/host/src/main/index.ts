import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { startHttpServer, type HttpServer } from "@novadeck/runner/http"
import { app, BrowserWindow, session, shell } from "electron"

import { apiUrlArgumentPrefix } from "../bridge.js"

const appId = "dev.mzpk.novadeck"
const developmentOrigin = "http://127.0.0.1:5173"
const currentDirectory = dirname(fileURLToPath(import.meta.url))

let server: HttpServer | undefined
let stopping = false

const waitFor = async (origin: string, attempts = 100): Promise<void> => {
  try {
    const response = await fetch(origin)
    if (response.ok) return
  } catch {
    // The UI dev server is still starting.
  }

  if (attempts === 1) throw new Error(`UI did not become ready at ${origin}`)

  await new Promise((resolve) => setTimeout(resolve, 100))
  return waitFor(origin, attempts - 1)
}

const createWindow = (origin: string): BrowserWindow => {
  const apiUrl = new URL("/api/", origin).href
  const window = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#090b10",
    webPreferences: {
      additionalArguments: [`${apiUrlArgumentPrefix}${apiUrl}`],
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(currentDirectory, "../preload/index.cjs"),
      sandbox: true,
    },
  })

  window.once("ready-to-show", () => window.show())

  window.webContents.on("will-navigate", (event) => event.preventDefault())

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url)
    return { action: "deny" }
  })

  if (app.isPackaged) {
    void window.loadFile(join(process.resourcesPath, "ui", "index.html"))
  } else {
    void window.loadURL(developmentOrigin)
  }

  return window
}

const launch = async (): Promise<void> => {
  server = await startHttpServer({
    port: 0,
    origins: app.isPackaged ? ["null"] : [developmentOrigin],
  })

  if (!app.isPackaged) await waitFor(developmentOrigin)

  createWindow(server.origin)
}

app.setAppUserModelId(appId)

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, respond) =>
    respond(false),
  )

  void launch().catch((error: unknown) => {
    console.error(error)
    app.exit(1)
  })

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (server) createWindow(server.origin)
    }
  })
})

app.on("before-quit", (event) => {
  if (!server || stopping) return

  event.preventDefault()
  stopping = true
  void server.close().finally(() => app.quit())
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
