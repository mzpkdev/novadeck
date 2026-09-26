import { contextBridge, ipcRenderer } from "electron"

import {
  apiUrlArgumentPrefix,
  runtimeConnectionChannel,
  type RuntimeConnection,
} from "../bridge.js"

const argument = process.argv.find((value) => value.startsWith(apiUrlArgumentPrefix))

if (!argument) throw new Error("NovaDeck API URL was not provided by the desktop host")

const apiUrl = new URL(argument.slice(apiUrlArgumentPrefix.length))

if (apiUrl.protocol !== "http:" || apiUrl.hostname !== "127.0.0.1" || !apiUrl.port) {
  throw new Error("NovaDeck API URL must be an HTTP loopback URL with an explicit port")
}

contextBridge.exposeInMainWorld("novadeck", {
  apiUrl: apiUrl.href,
  getRuntimeConnection: (): Promise<RuntimeConnection> =>
    ipcRenderer.invoke(runtimeConnectionChannel),
})
