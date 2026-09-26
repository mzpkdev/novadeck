export type Shortcut = {
  label: string
  key: string
  code?: string
  ctrl: boolean
  meta: boolean
  shift: boolean
  display: string[]
}

const platformBindings = (
  mac: boolean,
): Record<
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

const plainBindings = (): Record<
  "find" | "focus" | "newTerminal" | "zen" | "terminals" | "rename",
  Shortcut
> => ({
  find: {
    label: "Find a terminal",
    key: "/",
    ctrl: false,
    meta: false,
    shift: false,
    display: ["/"],
  },
  focus: {
    label: "Toggle Focus view",
    key: "f",
    ctrl: false,
    meta: false,
    shift: false,
    display: ["F"],
  },
  newTerminal: {
    label: "New terminal",
    key: "t",
    ctrl: false,
    meta: false,
    shift: false,
    display: ["T"],
  },
  zen: {
    label: "Toggle Zen mode",
    key: "z",
    ctrl: false,
    meta: false,
    shift: false,
    display: ["Z"],
  },
  terminals: {
    label: "Toggle terminal sidebar",
    key: "b",
    ctrl: false,
    meta: false,
    shift: false,
    display: ["B"],
  },
  rename: {
    label: "Rename active terminal",
    key: "F2",
    ctrl: false,
    meta: false,
    shift: false,
    display: ["F2"],
  },
})

export type CommandId =
  | "find"
  | "preferences"
  | "newTerminal"
  | "newSession"
  | "terminals"
  | "sessions"
  | "focus"
  | "zen"
  | "rename"
  | "closeTerminal"
  | "recent"
  | "previous"
  | "escape"
  | "previousView"
  | "nextView"
  | "previousTerminal"
  | "nextTerminal"

export type CommandBinding = Shortcut & { context: "global" | "workspace" }
export type CommandDefinition = {
  id: CommandId
  label: string
  bindings: CommandBinding[]
  input: "app" | "workspace"
  repeat: "allow" | "ignore"
  dialog: boolean
}

export const commandBindings = (mac = /Mac|iPhone|iPad/.test(navigator.platform)) => ({
  global: platformBindings(mac),
  workspace: plainBindings(),
})

const labels: Record<CommandId, string> = {
  find: "Find a terminal",
  preferences: "Open preferences",
  newTerminal: "New terminal",
  newSession: "New session",
  terminals: "Toggle terminal sidebar",
  sessions: "Toggle session sidebar",
  focus: "Toggle Focus view",
  zen: "Toggle Zen mode",
  rename: "Rename active terminal",
  closeTerminal: "Close active terminal",
  recent: "Recent terminals",
  previous: "Previous recent terminal",
  escape: "Return to workspace",
  previousView: "Previous view",
  nextView: "Next view",
  previousTerminal: "Previous terminal",
  nextTerminal: "Next terminal",
}

export const commandDefinitions = (mac?: boolean): CommandDefinition[] => {
  const { global, workspace } = commandBindings(mac)
  return (Object.keys(labels) as CommandId[]).map((id) => ({
    id,
    label: labels[id],
    bindings: [
      ...(id in global
        ? [{ ...global[id as keyof typeof global], context: "global" as const }]
        : []),
      ...(id in workspace
        ? [{ ...workspace[id as keyof typeof workspace], context: "workspace" as const }]
        : []),
      ...[
        { id: "closeTerminal", key: "Delete" },
        { id: "escape", key: "Escape" },
        { id: "previousView", key: "ArrowLeft" },
        { id: "nextView", key: "ArrowRight" },
        { id: "previousTerminal", key: "ArrowUp" },
        { id: "nextTerminal", key: "ArrowDown" },
      ]
        .filter((item) => item.id === id)
        .map(({ key }) => ({
          label: labels[id],
          key,
          ctrl: false,
          meta: false,
          shift: false,
          display: [key],
          context: "workspace" as const,
        })),
    ],
    input: id in global ? "app" : "workspace",
    repeat: [
      "recent",
      "previous",
      "previousView",
      "nextView",
      "previousTerminal",
      "nextTerminal",
    ].includes(id)
      ? "allow"
      : "ignore",
    dialog: id === "find" || id === "preferences",
  }))
}
