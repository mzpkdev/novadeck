import { loadCommandBindings } from "./commands/bindings-storage"
import { commandBindings } from "./commands/definitions"
import type { Shortcut } from "./commands/definitions"

export type { Shortcut } from "./commands/definitions"

const bindingsFor = <T extends Record<string, Shortcut>>(defaults: T): T => {
  const overrides = loadCommandBindings()
  return Object.fromEntries(
    Object.entries(defaults).map(([id, binding]) => [
      id,
      overrides[id as keyof typeof overrides]?.[0] ?? binding,
    ]),
  ) as T
}
export const shortcutBindings = () => bindingsFor(commandBindings().global)
export const workspaceShortcutBindings = () => bindingsFor(commandBindings().workspace)

export { workspaceShortcutTarget, workspaceOverlayOpen } from "./interaction/dom"

export const matchesShortcut = (event: KeyboardEvent, shortcut: Shortcut): boolean =>
  (event.key.toLowerCase() === shortcut.key.toLowerCase() ||
    (shortcut.code !== undefined && event.code === shortcut.code)) &&
  event.ctrlKey === shortcut.ctrl &&
  event.metaKey === shortcut.meta &&
  event.shiftKey === shortcut.shift &&
  !event.altKey
