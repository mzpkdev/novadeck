export const contentSecurityPolicyConnectSources = (
  apiUrl: string | undefined,
  development: boolean,
): readonly string[] => {
  const sources = new Set(["'self'", "http://127.0.0.1:*"])

  if (development) sources.add("ws://127.0.0.1:*")

  const configuredUrl = apiUrl?.trim()
  if (!configuredUrl) return [...sources]

  try {
    const url = new URL(configuredUrl)

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol")
    }

    if (!(url.protocol === "http:" && url.hostname === "127.0.0.1")) sources.add(url.origin)
  } catch {
    if (!configuredUrl.startsWith("/") && !configuredUrl.startsWith("./")) {
      throw new Error("VITE_API_URL must be an absolute HTTP(S) URL or a relative path")
    }
  }

  return [...sources]
}
