import { useEffect, useState } from "react"

import { preferencesStorageKey, readPreferences } from "./preferences-storage"

export const useWorkspacePreferences = () => {
  const [preferences, setPreferences] = useState(readPreferences)
  useEffect(() => {
    try {
      localStorage.setItem(preferencesStorageKey, JSON.stringify(preferences))
    } catch {
      /* Preferences still apply when storage is unavailable. */
    }
  }, [preferences])
  return { preferences, setPreferences }
}
