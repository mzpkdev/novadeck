import type { Session, WebContents, WebPreferences } from "electron"

// Web pages an agent shows load live in the companion pane, in a <webview>: a browser
// view apart from NovaDeck's page. Whatever the element asks for, each gets no preload,
// no Node, a sandbox, and its own session in memory, where every permission and
// download is refused. It goes only to http(s) addresses; a page opening a window opens
// it in the person's own browser instead.

/** The session live pages load in: in memory, apart from NovaDeck's own. */
export const pagesPartition = "novadeck-pages"

/** Whether `url` is an http(s) address, the only kind a page view loads. */
export const webAddress = (url: string): boolean => {
  try {
    const { protocol } = new URL(url)
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Settles a page view's settings as it attaches, from `will-attach-webview`; false when
 * it must not attach, as for anything but an http(s) address.
 */
export const attachPage = (
  preferences: WebPreferences,
  params: Record<string, string>,
): boolean => {
  delete preferences.preload
  preferences.nodeIntegration = false
  preferences.nodeIntegrationInSubFrames = false
  preferences.nodeIntegrationInWorker = false
  preferences.contextIsolation = true
  preferences.sandbox = true
  preferences.webSecurity = true
  preferences.allowRunningInsecureContent = false
  preferences.webviewTag = false
  preferences.partition = pagesPartition
  params.partition = pagesPartition
  delete params.preload
  delete params.allowpopups
  return webAddress(params.src ?? "")
}

type Opener = (url: string) => unknown

/** Keeps a page view to http(s) addresses, sending the windows it opens to the browser. */
export const guardPage = (contents: WebContents, openExternal: Opener): void => {
  contents.setWindowOpenHandler(({ url }) => {
    if (webAddress(url)) void openExternal(url)
    return { action: "deny" }
  })
  contents.on("will-navigate", (event, url) => {
    if (!webAddress(url)) event.preventDefault()
  })
  contents.on("will-redirect", (event, url) => {
    if (!webAddress(url)) event.preventDefault()
  })
}

/** Refuses the pages' session every permission, and every download. */
export const lockPagesSession = (pages: Session): void => {
  pages.setPermissionCheckHandler(() => false)
  pages.setPermissionRequestHandler((_contents, _permission, respond) => respond(false))
  pages.setDevicePermissionHandler(() => false)
  pages.on("will-download", (event) => event.preventDefault())
}
