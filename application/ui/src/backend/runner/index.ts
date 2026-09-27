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
import type { ConnectBackend } from "../port"
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

// What went wrong, in words, with the code for anyone reporting it.
const failures: Partial<Record<RunnerError["code"], string>> = {
  UNAUTHORIZED: "The runner did not accept this app's credentials.",
  INCOMPATIBLE_PROTOCOL: "This app and its runner are different versions.",
  DISCONNECTED: "The runner did not answer.",
  CLOSED: "The runner is not available.",
  RESOURCE_LIMIT: "The runner has too many connections open.",
  RUNTIME_CLOSING: "The runner is shutting down.",
}

export const describeFailure = (error: unknown): string => {
  if (!(error instanceof RunnerError))
    return `Something went wrong while loading the workspace: ${error instanceof Error ? error.message : String(error)}`
  // A message of its own, such as the missing configuration of a browser build.
  const own = error.message !== error.code && error.code === "CLOSED" ? error.message : undefined
  return `${own ?? failures[error.code] ?? "The runner reported a problem."} (${error.code})`
}

const unavailable = (error: unknown): Error => new Error(describeFailure(error), { cause: error })

// Connects to the desktop app's own runner, or in a browser to the one the build
// names, and loads the workspace before the app renders.
export const connectRunnerBackend: ConnectBackend = async (signal) => {
  let runner: Runner
  try {
    runner = await connectRunner(transport(), { signal })
  } catch (error) {
    throw unavailable(error)
  }
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
