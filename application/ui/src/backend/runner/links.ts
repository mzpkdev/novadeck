import { WebLinksAddon } from "@xterm/addon-web-links"
import type { ILinkHandler, Terminal } from "@xterm/xterm"

type Click = Pick<MouseEvent, "ctrlKey" | "metaKey">
type Platform = "mac" | "other"

const currentPlatform = (): Platform =>
  /Mac|iPhone|iPad/.test(navigator.platform) ? "mac" : "other"

// A link opens on ⌘-click on Apple platforms and Ctrl-click elsewhere, so a plain click
// still selects text or reaches a program that reads the mouse.
export const opensLink = (event: Click, platform: Platform): boolean =>
  platform === "mac" ? event.metaKey : event.ctrlKey

export const linkHint = (platform: Platform): string =>
  platform === "mac" ? "⌘-click to open" : "Ctrl-click to open"

// Only web pages leave the app; a terminal's output can name any scheme.
export const webLink = (text: string): string | undefined => {
  try {
    const url = new URL(text)
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined
  } catch {
    return undefined
  }
}

// The desktop host hands a page the app opens to the system browser; a browser opens a tab.
const openPage = (url: string): void => void window.open(url, "_blank", "noopener,noreferrer")

// Links in a terminal: addresses in its text and the hyperlinks a program prints (OSC 8).
// Hovering one names the click that opens it.
export const linkTerminal = (
  xterm: Terminal,
  { platform = currentPlatform(), open = openPage } = {},
): void => {
  const activate = (event: MouseEvent, text: string): void => {
    const url = webLink(text)
    if (url && opensLink(event, platform)) open(url)
  }
  const hint = {
    hover: () => xterm.element?.setAttribute("title", linkHint(platform)),
    leave: () => xterm.element?.removeAttribute("title"),
  }
  const handler: ILinkHandler = { activate, ...hint }
  xterm.options.linkHandler = handler
  xterm.loadAddon(new WebLinksAddon(activate, hint))
}
