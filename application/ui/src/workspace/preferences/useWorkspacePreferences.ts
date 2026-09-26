import { useStore } from "zustand"

import { useWorkspaceServices } from "../../app/workspace-services"
import type { PreferencesValue } from "../model/types"

export const useWorkspacePreferences = () => {
  const { preferencesStore } = useWorkspaceServices()
  const preferences = useStore(preferencesStore)
  return {
    preferences,
    setPreferences: (next: PreferencesValue): void => preferencesStore.setState(next, true),
  }
}
