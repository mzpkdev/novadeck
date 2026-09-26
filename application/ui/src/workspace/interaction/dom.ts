// DOM contracts for keyboard policy and focus restoration. Library-specific
// overlay markup stays here so interaction owners do not depend on it.
const editingOrOverlay =
  'input:not([type="radio"], [type="checkbox"], [type="button"], [type="submit"], [type="reset"]), textarea, select, [contenteditable]:not([contenteditable="false"]), .xterm, [role="textbox"], [role="searchbox"], [role="combobox"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="slider"], [role="spinbutton"], [role="tablist"], [data-scope="popover"][data-state="open"]'

export const workspaceShortcutTarget = (target: EventTarget | null): boolean =>
  !(target instanceof Element && target.closest(editingOrOverlay))

export const workspaceOverlayOpen = (): boolean =>
  Boolean(
    document.querySelector(
      '[role="dialog"]:not([aria-hidden="true"]), [role="menu"]:not([hidden]), [role="listbox"][data-state="open"], [data-scope="popover"][data-state="open"]',
    ),
  )

const within = (target: EventTarget | null, selector: string): boolean =>
  target instanceof Element && Boolean(target.closest(selector))
export const insideOpenZenDock = (target: EventTarget | null): boolean =>
  within(target, '[data-workspace-zen-dock][data-open="true"]')
export const insideViewSwitch = (target: EventTarget | null): boolean =>
  within(target, "[data-workspace-view-switch]")
export const insideNavigationControl = (target: EventTarget | null): boolean =>
  within(target, '[role="separator"], [role="radiogroup"]')
export const insideCanvasNode = (target: EventTarget | null): boolean =>
  within(target, "[data-workspace-canvas-node], .react-flow__node")
export const insideTerminalTab = (target: EventTarget | null): boolean =>
  within(target, "[data-session-id]")
export const insideTerminalRename = (target: EventTarget | null): boolean =>
  within(target, 'input[aria-label^="Rename "]')
export const insideSwitcherClose = (target: EventTarget | null): boolean =>
  within(target, '[aria-label="Close terminal switcher"]')
export const insideTerminalInput = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement &&
  target.getAttribute("aria-label")?.startsWith("Command for ") === true
export const terminalTabInteractionActive = (): boolean =>
  Boolean(document.querySelector(".session-tab.editing, .session-tab.dragging"))

export const sidebarToggle = (panel: "terminals" | "sessions"): HTMLElement | null =>
  document.getElementById(`${panel}-toggle`)
export const focusSidebarToggle = (panel: "terminals" | "sessions"): void =>
  sidebarToggle(panel)?.focus()
export const focusTerminalTab = (id: string): void =>
  document
    .querySelector<HTMLElement>(`[data-session-id="${CSS.escape(id)}"] .sidebar-item-select`)
    ?.focus({ preventScroll: true })
export const focusWorkspaceViewport = (): void =>
  document.querySelector<HTMLElement>("[data-workspace-viewport]")?.focus({ preventScroll: true })
export const focusZenCreate = (): void =>
  document.querySelector<HTMLElement>("[data-workspace-zen-create]")?.focus({ preventScroll: true })
export const focusZenEnter = (): void =>
  document.querySelector<HTMLElement>("[data-workspace-zen-enter]")?.focus({ preventScroll: true })

export const workspaceArea = (): HTMLElement | null =>
  document.querySelector<HTMLElement>("[data-workspace-area]")
export const terminalElement = (id: string): HTMLElement | null =>
  workspaceArea()?.querySelector<HTMLElement>(`[data-terminal="${CSS.escape(id)}"]`) ?? null
export const workspaceContent = (): HTMLElement | null =>
  workspaceArea()?.querySelector<HTMLElement>("[data-terminal], [data-workspace-empty]") ?? null
export const terminalSurface = (terminal: HTMLElement): HTMLElement | null =>
  terminal.querySelector<HTMLElement>("[data-terminal-content]")
