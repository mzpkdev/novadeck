// The browser emulator: xterm's terminal in a view, and the pool that draws it with WebGL.
export { createView } from "./view.js"
export type { View, ViewLinks, ViewOptions } from "./view.js"
export { createRenderers, contextCap, loadWebgl, probeWebgl, webglRenderers } from "./renderer.js"
export type { Drawing, RendererDeps, Renderers, ScreenRenderer } from "./renderer.js"
export type { IDisposable, IEvent, ITheme, Terminal } from "@xterm/xterm"
