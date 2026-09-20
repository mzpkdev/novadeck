import type { NovaDeckApi } from "../../shared/api"

declare global {
  interface Window {
    novadeck: NovaDeckApi
  }
}
