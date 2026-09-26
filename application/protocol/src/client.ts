import { createORPCClient } from "@orpc/client"
import { StandardRPCLink, type StandardLinkClient } from "@orpc/client/standard"
import type { RPCLinkOptions } from "@orpc/client/websocket"
import { ClientPeer } from "@orpc/standard-server-peer"

import type { RuntimeClient } from "./contract.js"

export type RuntimeSocket = RPCLinkOptions<Record<never, never>>["websocket"]

const disconnected = () => new Error("Runtime connection is closed")

export const createRuntimeClient = (websocket: RuntimeSocket): RuntimeClient => {
  // oRPC 1.x's stock adapter can reject an async abort listener after a socket closes.
  // Keep oRPC's wire protocol; settle the peer instead of throwing from the send callback.
  const peer = new ClientPeer((message) => {
    if (websocket.readyState !== 1) {
      peer.close({ reason: disconnected() })
      return
    }
    try {
      websocket.send(
        typeof message === "string"
          ? message
          : Uint8Array.from(message instanceof Uint8Array ? message : new Uint8Array(message)),
      )
    } catch (error) {
      peer.close({ reason: error })
    }
  })
  let received = Promise.resolve()
  websocket.addEventListener("message", (event) => {
    received = received
      .then(async () => {
        const data = event.data instanceof Blob ? await event.data.arrayBuffer() : event.data
        await peer.message(data)
      })
      .catch((error: unknown) => peer.close({ reason: error }))
  })
  websocket.addEventListener("close", () => peer.close({ reason: disconnected() }))

  const transport: StandardLinkClient<Record<never, never>> = {
    async call(request) {
      if (websocket.readyState === 0) {
        await new Promise<void>((resolve) => {
          const settle = () => {
            websocket.removeEventListener("open", settle)
            websocket.removeEventListener("close", settle)
            request.signal?.removeEventListener("abort", settle)
            resolve()
          }
          websocket.addEventListener("open", settle, { once: true })
          websocket.addEventListener("close", settle, { once: true })
          request.signal?.addEventListener("abort", settle, { once: true })
          if (request.signal?.aborted) settle()
        })
      }
      request.signal?.throwIfAborted()
      if (websocket.readyState !== 1) throw disconnected()
      const response = await peer.request(request)
      return { ...response, body: () => Promise.resolve(response.body) }
    },
  }
  return createORPCClient(new StandardRPCLink(transport, { url: "http://orpc" }))
}
