export type ServiceStatus = Readonly<{
  status: "ready"
}>

const parseStatus = (value: unknown): ServiceStatus => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("status" in value) ||
    value.status !== "ready"
  ) {
    throw new Error("Status response is invalid")
  }

  return { status: value.status }
}

const configuredApiUrl = (): string =>
  window.novadeck?.apiUrl || import.meta.env.VITE_API_URL || "/api"

const statusEndpoint = (): string => {
  const apiUrl = new URL(configuredApiUrl(), globalThis.location.origin).href

  return new URL("status", `${apiUrl.replace(/\/$/, "")}/`).href
}

export const readStatus = async (endpoint = statusEndpoint()): Promise<ServiceStatus> => {
  const response = await fetch(endpoint)

  if (!response.ok) throw new Error(`Status request failed with ${response.status}`)

  return parseStatus(await response.json())
}
