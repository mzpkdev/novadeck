export type Shortcut = {
  label: string
  key: string
  ctrl: boolean
  meta: boolean
  shift: boolean
  display: string[]
}

export const shortcutBindings = (): Record<
  "find" | "recent" | "previous" | "focus" | "newTerminal" | "preferences",
  Shortcut
> => {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform)
  return {
    find: {
      label: "Find a terminal",
      key: "k",
      ctrl: !mac,
      meta: mac,
      shift: !mac,
      display: mac ? ["⌘", "K"] : ["Ctrl", "Shift", "K"],
    },
    recent: {
      label: "Recent terminals",
      key: "Tab",
      ctrl: true,
      meta: false,
      shift: false,
      display: ["Ctrl", "Tab"],
    },
    previous: {
      label: "Previous recent terminal",
      key: "Tab",
      ctrl: true,
      meta: false,
      shift: true,
      display: ["Ctrl", "Shift", "Tab"],
    },
    focus: {
      label: "Toggle Focus view",
      key: "Enter",
      ctrl: !mac,
      meta: mac,
      shift: !mac,
      display: mac ? ["⌘", "Enter"] : ["Ctrl", "Shift", "Enter"],
    },
    newTerminal: {
      label: "New terminal",
      key: "t",
      ctrl: !mac,
      meta: mac,
      shift: !mac,
      display: mac ? ["⌘", "T"] : ["Ctrl", "Shift", "T"],
    },
    preferences: {
      label: "Open preferences",
      key: ",",
      ctrl: !mac,
      meta: mac,
      shift: false,
      display: [mac ? "⌘" : "Ctrl", ","],
    },
  }
}

export const matchesShortcut = (event: KeyboardEvent, shortcut: Shortcut): boolean =>
  event.key.toLowerCase() === shortcut.key.toLowerCase() &&
  event.ctrlKey === shortcut.ctrl &&
  event.metaKey === shortcut.meta &&
  event.shiftKey === shortcut.shift &&
  !event.altKey
