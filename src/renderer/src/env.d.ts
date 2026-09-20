import type { NovaDeckAPI } from "../../shared/api"

declare global {
  interface Window {
    novadeck: NovaDeckAPI
  }
}
