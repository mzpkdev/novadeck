import { randomBytes } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { startRuntime, type Runtime } from "@novadeck/runtime/terminal"
import { app, BrowserWindow, ipcMain, session, shell } from "electron"

import {
  apiUrlArgumentPrefix,
  runtimeConnectionChannel,
  type RuntimeConnection,
} from "../bridge.js"
import { isTrustedFrame } from "./renderer.js"

const appId = "dev.mzpk.novadeck"
const developmentOrigin = "http://127.0.0.1:5173"
const currentDirectory = dirname(fileURLToPath(import.meta.url))

let runtime: Runtime | undefined
let connection: RuntimeConnection | undefined
let stopping = false
const trustedWindows = new Map<number, string>()

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

const createWindow = (runtimeOrigin: string): BrowserWindow => {
  const apiUrl = new URL("/api/", runtimeOrigin).href
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

  const document = app.isPackaged
    ? pathToFileURL(join(process.resourcesPath, "ui", "index.html")).href
    : developmentOrigin
  const id = window.webContents.id
  trustedWindows.set(id, document)
  window.once("closed", () => trustedWindows.delete(id))

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
  const directory = app.getPath("userData")
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const token = randomBytes(32).toString("hex")
  runtime = await startRuntime({
    hostname: "127.0.0.1",
    port: 0,
    // Electron sends file:// for its packaged document; browsers can serialize it as null.
    corsOrigins: app.isPackaged ? ["file://", "null"] : [developmentOrigin],
    apiToken: token,
    databasePath: join(directory, "workspace.sqlite"),
  })
  const url = new URL("/api/rpc", runtime.origin)
  url.protocol = "ws:"
  connection = { url: url.href, token }

  if (!app.isPackaged) await waitFor(developmentOrigin)

  createWindow(runtime.origin)
}

app.setAppUserModelId(appId)

app.whenReady().then(() => {
  ipcMain.handle(runtimeConnectionChannel, (event): RuntimeConnection => {
    const document = trustedWindows.get(event.sender.id)
    if (
      !connection ||
      stopping ||
      !document ||
      !isTrustedFrame(event.senderFrame, event.sender.mainFrame, document)
    ) {
      throw new Error("Runtime connection is available only to the application document")
    }
    return connection
  })
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, respond) =>
    respond(false),
  )

  void launch().catch(async () => {
    // Startup errors can include transport details; credentials never go to logs.
    console.error("NovaDeck could not start its local runtime or load the interface")
    stopping = true
    connection = undefined
    try {
      await runtime?.close()
    } finally {
      app.exit(1)
    }
  })

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (runtime) createWindow(runtime.origin)
    }
  })
})

app.on("before-quit", (event) => {
  if (!runtime || stopping) return

  event.preventDefault()
  stopping = true
  connection = undefined
  void runtime
    .close()
    .catch(() => console.error("NovaDeck could not cleanly stop its local runtime"))
    .finally(() => app.quit())
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
