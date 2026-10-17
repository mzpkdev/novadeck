# @novadeck/wire

RPC calls and streams between processes over a WebSocket or a MessagePort: channels, a client
generic over its contract, its transports and its errors. It carries an oRPC contract it doesn't
know: the app's procedures and their codes stay the app's.

## Subpaths

- `.`: what both ends share.
  - `Channel`, a bidirectional message channel (`open`, `send`, `listen`, `closed`, `close`),
    and `socketChannel` and `portChannel` over anything shaped like a WebSocket or a
    MessagePort (`WebSocketLike`, `MessagePortLike`: structural types, so DOM, Node.js, `ws`
    and Electron's ports all fit). Closing a channel here settles `closed` at once, as a port
    only tells its peer and a socket's close event can take a round trip.
  - `WireError`, the error a client reports, with a stable `code` (the wire's or the app's)
    and the contract's `data`; `normalize` turns an oRPC error into one, and `hasCode`
    matches one by code.
  - `wireErrors`, the codes the wire's own server side refuses with, as an oRPC error map
    for the app to spread into its contract's: `UNAUTHORIZED`, `INCOMPATIBLE_PROTOCOL`,
    `RESOURCE_LIMIT`, `SLOW_CONSUMER`, `INVALID_CURSOR`. The client adds `DISCONNECTED` and
    `CLOSED`, and oRPC `BAD_REQUEST` and `INTERNAL_SERVER_ERROR` (`WireErrorCode`).
- `./client`: the client side, for browsers and Node.
  - `createWireClient<C>(channel)`, an oRPC client of contract `C` over a channel. Requests
    fail and streams end as soon as the channel closes. A call in flight fails as
    `DISCONNECTED`; a stream's pending read fails with oRPC's own error, so a caller that
    needs the cause asks the channel whether it's still open.
  - `Transport`, how a client opens a channel (`connect(signal)`) and the token it sends in
    its handshake, if any. `websocket(url, { token })` reaches a server deployed on its own,
    the token kept out of the URL; `messagePort(port)` reaches one its host hands a port to.
    A single port connects once; pass a function that asks for a fresh port to reconnect.
- `./server` (Node only): the server's side.
  - `KeyedChanges<Key, Change>`, one reader's stream of keyed state: the current state, then
    `synced`, then later changes, holding only the latest unread change per key, each in the
    place its key first changed. A key the reader was never told of leaves without a removal.
  - `Versioned<State>`, whole state for any number of readers: each reads it now and again
    after every change, however many changes came between; `progress()` tells a change in
    progress at most once every `throttleMs`. `release(owner)` ends one owner's streams.
  - `Latest<T>`, a stream of snapshots that keeps only the newest unread one, and never sends
    again the one the reader has.

  None holds changes for a reader: changes made while it hasn't read yet come to it as one.
  A remote reader that can't keep up isn't slowed either: the server's socket sends what it
  reads, and cuts off a reader whose unsent bytes outgrow its send budget (the app's, for
  now).

- `./testing`: channels held in memory, for tests that need no socket or port.
  `memoryPorts()` is the two ends of a port, delivering on a microtask, cloned, in the same
  order every run; `fakeChannel()` is a channel whose far end is the test, which sees what
  was sent and can deliver, drop the channel and make sends fail.

## Pins

`@orpc/client`, `@orpc/contract`, `@orpc/standard-server-peer` and `@orpc/server` come from
the pnpm catalog in the root `pnpm-workspace.yaml`, which every package that uses oRPC takes
them from too, so a client and its server can't drift apart.
