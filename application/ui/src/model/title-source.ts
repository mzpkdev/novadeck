import type { TitleSource } from "./types"

// Who a terminal's name is from, as its tab's tooltip says it.
export const titleSourceText = (source: TitleSource): string => {
  switch (source.kind) {
    case "person":
      return "Named by you"
    case "agent":
      return `Named by the agent in ${source.by}`
    case "fallback":
      return "Named after its first prompt"
    case "default":
      return "Default name"
  }
}
