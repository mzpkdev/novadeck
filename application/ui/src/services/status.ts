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

const apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8787/api"

const statusEndpoint = (): string => new URL("status", `${apiUrl.replace(/\/$/, "")}/`).href

export const readStatus = async (endpoint = statusEndpoint()): Promise<ServiceStatus> => {
  const response = await fetch(endpoint)

  if (!response.ok) throw new Error(`Status request failed with ${response.status}`)

  return parseStatus(await response.json())
}
