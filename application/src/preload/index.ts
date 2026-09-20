import { contextBridge } from "electron"

import type { NovaDeckApi } from "../shared/api"

const api = {
  versions: {
    chrome: process.versions.chrome ?? "unknown",
    electron: process.versions.electron ?? "unknown",
    node: process.versions.node,
  },
} satisfies NovaDeckApi

contextBridge.exposeInMainWorld("novadeck", api)
