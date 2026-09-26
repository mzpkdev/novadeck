export const apiUrlArgumentPrefix = "--novadeck-api-url="
export const runtimeConnectionChannel = "novadeck:runtime-connection"

export type RuntimeConnection = Readonly<{ url: string; token: string }>
