import { contextBridge } from "electron"

import type { NovaDeckAPI } from "../shared/api"

const api = {
  versions: {
    chrome: process.versions.chrome ?? "unknown",
    electron: process.versions.electron ?? "unknown",
    node: process.versions.node,
  },
} satisfies NovaDeckAPI

contextBridge.exposeInMainWorld("novadeck", api)
