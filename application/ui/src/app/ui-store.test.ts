import { context, describe, expect, it } from "../test"
import { createUiStore, persist, type UiState } from "./ui-store"

const initial = (): UiState => ({
  location: {
    route: {
      projectId: "project",
      sessionId: "initial",
      view: "focus",
      terminal: "",
      panel: "terminals",
      dialog: null,
      section: "general",
    },
    dialogDepth: 0,
    navigationType: "POP",
  },
  preferences: { fontSize: 13, enabledViews: ["focus", "grid"] },
})

describe("UI store persistence", () => {
  context("when attached", () => {
    it("writes the slice at once and again only after it changes", () => {
      const ui = createUiStore(initial())
      const written: number[] = []
      const stop = persist(
        ui,
        (state) => state.preferences,
        (preferences) => written.push(preferences.fontSize),
      )
      expect(written).toEqual([13])
      ui.update((state) => ({ ...state }))
      expect(written).toEqual([13])
      ui.update((state) => ({ ...state, preferences: { ...state.preferences, fontSize: 15 } }))
      expect(written).toEqual([13, 15])
      stop()
      ui.update((state) => ({ ...state, preferences: { ...state.preferences, fontSize: 12 } }))
      expect(written).toEqual([13, 15])
    })
  })
})
