export type Shortcut = {
  label: string
  key: string
  code?: string
  ctrl: boolean
  meta: boolean
  shift: boolean
  display: string[]
}

export const shortcutBindings = (): Record<
  | "find"
  | "recent"
  | "previous"
  | "focus"
  | "newTerminal"
  | "newSession"
  | "terminals"
  | "sessions"
  | "preferences",
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
    newSession: {
      label: "New session",
      key: "n",
      ctrl: !mac,
      meta: mac,
      shift: true,
      display: [mac ? "⌘" : "Ctrl", "Shift", "N"],
    },
    terminals: {
      label: "Toggle terminal sidebar",
      key: "1",
      code: "Digit1",
      ctrl: !mac,
      meta: mac,
      shift: true,
      display: [mac ? "⌘" : "Ctrl", "Shift", "1"],
    },
    sessions: {
      label: "Toggle session sidebar",
      key: "2",
      code: "Digit2",
      ctrl: !mac,
      meta: mac,
      shift: true,
      display: [mac ? "⌘" : "Ctrl", "Shift", "2"],
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
  (event.key.toLowerCase() === shortcut.key.toLowerCase() ||
    (shortcut.code !== undefined && event.code === shortcut.code)) &&
  event.ctrlKey === shortcut.ctrl &&
  event.metaKey === shortcut.meta &&
  event.shiftKey === shortcut.shift &&
  !event.altKey
