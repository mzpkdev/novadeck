import { visibleSwitcher, type RecentSwitcher } from "../../terminals/recent"
import type { RecentCommands } from "../commands/recent"
import type { UiState } from "../ui-store"
import { useWorkspaceServices } from "./context"
import { useStoreSelector } from "./useStoreSelector"

export type RecentSwitcherOptions = {
  context: string
  dialog: string | null
}

export type RecentSwitcherController = {
  readonly recentSwitcher: RecentSwitcher | null
  readonly visibleRecentSwitcher: RecentSwitcher | null
  readonly setRecentSwitcher: RecentCommands["setSwitcher"]
  readonly closeRecentSwitcher: RecentCommands["closeSwitcher"]
  readonly openRecentSwitcher: RecentCommands["openSwitcher"]
  readonly recentIds: RecentCommands["recentIds"]
}

const selectSwitcher = (state: UiState): RecentSwitcher | null => state.recent.switcher

export const useRecentSwitcher = ({
  context,
  dialog,
}: RecentSwitcherOptions): RecentSwitcherController => {
  const { ui, commands } = useWorkspaceServices()
  const recentSwitcher = useStoreSelector(ui, selectSwitcher)
  return {
    recentSwitcher,
    visibleRecentSwitcher: visibleSwitcher(recentSwitcher, context, dialog),
    setRecentSwitcher: commands.setSwitcher,
    closeRecentSwitcher: commands.closeSwitcher,
    openRecentSwitcher: commands.openSwitcher,
    recentIds: commands.recentIds,
  }
}
