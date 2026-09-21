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

const statusEndpoint = (): string => {
  const runtime = new URLSearchParams(globalThis.location.search).get("runtime")
  const origin = runtime ?? globalThis.location.origin

  return new URL("/api/status", origin).href
}

export const readStatus = async (endpoint = statusEndpoint()): Promise<ServiceStatus> => {
  const response = await fetch(endpoint)

  if (!response.ok) throw new Error(`Status request failed with ${response.status}`)

  return parseStatus(await response.json())
}
