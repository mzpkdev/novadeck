export const contentSecurityPolicyConnectSources = (
  apiUrl: string | undefined,
  development: boolean,
): readonly string[] => {
  const sources = new Set(["'self'", "http://127.0.0.1:*", "ws://127.0.0.1:*"])

  if (development) sources.add("ws://127.0.0.1:*")

  const configuredUrl = apiUrl?.trim()
  if (!configuredUrl) return [...sources]

  try {
    const url = new URL(configuredUrl)

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol")
    }

    if (!(url.protocol === "http:" && url.hostname === "127.0.0.1")) {
      sources.add(url.origin)
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
      sources.add(url.origin)
    }
  } catch {
    const base = new URL("https://novadeck.invalid")
    const hasRelativePrefix = configuredUrl.startsWith("/") || configuredUrl.startsWith("./")
    const isRelativePath = hasRelativePrefix && new URL(configuredUrl, base).origin === base.origin

    if (!isRelativePath) {
      throw new Error("VITE_API_URL must be an absolute HTTP(S) URL or a relative path")
    }
  }

  return [...sources]
}
