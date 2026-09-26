export const runtimeEndpoint = (apiUrl: string, pageUrl: string): string => {
  const url = new URL(apiUrl, pageUrl)
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use an HTTP(S) API address without credentials, query parameters, or a fragment.",
    )
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  if (url.protocol === "http:" && !loopback)
    throw new Error("Remote runtimes require an HTTPS connection.")
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = `${url.pathname.replace(/\/$/, "")}/rpc`
  return url.href
}
