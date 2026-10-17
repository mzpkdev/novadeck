import { loadEnv, type ConfigEnv, type Plugin } from "vite"

/** A URL the app is configured with, and the setting that names it, for its errors. */
export type ConfiguredUrl = { readonly url: string | undefined; readonly name: string }

// The origin of a runner a browser build connects to, which must be a WebSocket URL.
const webSocketOrigin = ({ url, name }: ConfiguredUrl & { url: string }): string => {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === "ws:" || parsed.protocol === "wss:") return parsed.origin
  } catch {
    // Reported below.
  }
  throw new Error(`${name} must be an absolute ws: or wss: URL`)
}

/**
 * The connect-src sources of an app that talks to services on loopback, and, where
 * configured, to an HTTP(S) API and a WebSocket runner elsewhere. While served, the
 * development server's WebSocket on loopback too.
 */
export const connectSources = (options: {
  readonly api?: ConfiguredUrl
  readonly runner?: ConfiguredUrl
  readonly development: boolean
}): readonly string[] => {
  const sources = new Set(["'self'", "http://127.0.0.1:*"])

  if (options.development) sources.add("ws://127.0.0.1:*")

  const runner = options.runner?.url?.trim()
  if (runner && options.runner) sources.add(webSocketOrigin({ ...options.runner, url: runner }))

  const api = options.api?.url?.trim()
  if (!api || !options.api) return [...sources]

  try {
    const url = new URL(api)

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol")
    }

    if (!(url.protocol === "http:" && url.hostname === "127.0.0.1")) sources.add(url.origin)
  } catch {
    const base = new URL("https://build-kit.invalid")
    const hasRelativePrefix = api.startsWith("/") || api.startsWith("./")
    const isRelativePath = hasRelativePrefix && new URL(api, base).origin === base.origin

    if (!isRelativePath) {
      throw new Error(`${options.api.name} must be an absolute HTTP(S) URL or a relative path`)
    }
  }

  return [...sources]
}

/** A build, as the app's policy sees it: its mode, whether it's served, and its environment. */
export type Build = {
  readonly mode: string
  readonly command: ConfigEnv["command"]
  /** The environment's variables with the app's prefix, from the process or its env files. */
  readonly env: Readonly<Record<string, string | undefined>>
}

/** The name of the plugin, for a config that leaves it out, as a test runner's does. */
export const contentSecurityPolicyName = "build-kit-content-security-policy"

/**
 * Fills the connect-src of the page's Content Security Policy: `placeholder` in its
 * index.html becomes the sources `connect` gives for the build. A page without the
 * placeholder fails the build, so a policy can't silently go unfilled.
 */
export const contentSecurityPolicy = (options: {
  readonly placeholder: string
  readonly connect: (build: Build) => readonly string[]
  /** The prefix of the variables the policy reads; Vite's own, `VITE_`, by default. */
  readonly envPrefix?: string
}): Plugin => {
  let build: Build
  return {
    name: contentSecurityPolicyName,
    config(_config, { mode, command }) {
      // The env files', with the process's own variables before them, as Vite reads them.
      build = { mode, command, env: loadEnv(mode, process.cwd(), options.envPrefix ?? "VITE_") }
    },
    transformIndexHtml(html) {
      if (!html.includes(options.placeholder)) {
        throw new Error("Content Security Policy connect-src placeholder is missing")
      }
      return html.replace(options.placeholder, options.connect(build).join(" "))
    },
  }
}
