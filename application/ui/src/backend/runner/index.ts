import type { DesktopBridge } from "@novadeck/protocol/bridge"
import {
  connectRunner,
  desktop,
  RunnerError,
  websocket,
  type Runner,
  type Transport,
} from "@novadeck/protocol/client"

import { sessionName } from "../../model/session-name"
import type { ConnectBackend, ConnectFailure } from "../port"
import { runnerBackend } from "./backend"
import type { RunnerListing } from "./seed"

// What the desktop host's preload script offers the page; absent in a browser.
const desktopHost = (): Partial<DesktopBridge> | undefined =>
  (globalThis as { novadeck?: Partial<DesktopBridge> }).novadeck

const transport = (): Transport => {
  if (desktopHost()?.requestRunner) return desktop()
  const url = import.meta.env.VITE_NOVADECK_RUNNER_URL
  const token = import.meta.env.VITE_NOVADECK_RUNNER_TOKEN
  if (!url || !token)
    throw new RunnerError("CLOSED", "Set VITE_NOVADECK_RUNNER_URL and VITE_NOVADECK_RUNNER_TOKEN.")
  return websocket(url, { token })
}

// Lists what the runner holds. A first run gets a "Home" project in the runner's home
// directory, and every project without a session gets one, so the workspace can open.
export const loadListing = async (
  runner: Pick<Runner, "projects" | "sessions" | "terminals">,
  newId: () => string,
  now: () => number,
): Promise<RunnerListing> => {
  const listed = await runner.projects.list()
  const projects = listed.length
    ? listed
    : [await runner.projects.create({ id: newId(), name: "Home" })]
  return Promise.all(
    projects.map(async (project) => {
      const found = await runner.sessions.list({ projectId: project.id })
      const sessions = found.length
        ? found
        : [
            await runner.sessions.create({
              id: newId(),
              projectId: project.id,
              name: sessionName(now()),
            }),
          ]
      return {
        project,
        sessions: await Promise.all(
          sessions.map(async (session) => ({
            session,
            terminals: await runner.terminals.list({ sessionId: session.id }),
          })),
        ),
      }
    }),
  )
}

const newId = (): string => crypto.randomUUID()

// What went wrong, sorted by what the person can do about it, in words for them and
// with the code and the runner's own message for anyone reporting it.
const transient: ReadonlySet<RunnerError["code"]> = new Set([
  "DISCONNECTED",
  "CLOSED",
  "RUNTIME_CLOSING",
  "RESOURCE_LIMIT",
])
export const connectFailure = (error: unknown): ConnectFailure => {
  if (!(error instanceof RunnerError))
    return {
      kind: "unknown",
      message: "Something went wrong starting NovaDeck.",
      code: "UNKNOWN",
      detail: error instanceof Error ? error.message : String(error),
    }
  const { code } = error
  const detail = error.message
  if (transient.has(code))
    return { kind: "transient", message: "The runner didn't start.", code, detail }
  if (code === "INCOMPATIBLE_PROTOCOL")
    return {
      kind: "incompatible",
      message: "This runner is from a different NovaDeck version.",
      code,
      detail,
    }
  if (code === "UNAUTHORIZED")
    return { kind: "unauthorized", message: "The runner didn't accept this app.", code, detail }
  return { kind: "unknown", message: "Something went wrong starting NovaDeck.", code, detail }
}

const unavailable = (error: unknown): Error => {
  const failure = connectFailure(error)
  return Object.assign(new Error(failure.message, { cause: error }), { failure })
}

// Connects to the desktop app's own runner, or in a browser to the one the build
// names, and loads the workspace before the app renders.
export const connectRunnerBackend: ConnectBackend = async (signal, progress) => {
  let runner: Runner
  try {
    runner = await connectRunner(transport(), { signal })
  } catch (error) {
    throw unavailable(error)
  }
  progress("loading")
  try {
    const listing = await loadListing(runner, newId, Date.now)
    const pick = desktopHost()?.pickDirectory
    return {
      createBackend: () =>
        runnerBackend(runner, listing, {
          newId,
          ...(pick ? { pickDirectory: () => pick() } : {}),
        }).backend,
      close: () => void runner.close(),
    }
  } catch (error) {
    void runner.close()
    throw unavailable(error)
  }
}
