import { execFileSync } from "node:child_process"

import type { AgentSetup, KeychainItem } from "./agents/agent.js"

/** Where this system keeps the logins a harness may hold, as a failure names it. */
export const loginStore =
  process.platform === "darwin" ? "the macOS Keychain" : "Windows' Credential Manager"

/**
 * Whether the user's Keychain holds a generic password of the service and account,
 * asked by its attributes alone: `security` reads no secret without `-w`, so this never
 * asks the person to allow access.
 */
const inKeychain = ({ service, account }: KeychainItem): boolean => {
  try {
    execFileSync("/usr/bin/security", ["find-generic-password", "-s", service, "-a", account], {
      stdio: "ignore",
      timeout: 10_000,
    })
    return true
  } catch {
    return false
  }
}

/**
 * The targets this system's login store holds for this user, by name only, never a
 * secret. On Windows, what `cmdkey /list` prints after `target=` (`gemini:antigravity`).
 * On macOS, where only asking for an item tells, those of the setups' `keychain` items
 * the Keychain holds, named as Windows names them (`service:account`). Empty elsewhere.
 */
export const credentialTargets = (
  setups: readonly Pick<AgentSetup, "keychain">[],
  holds: (item: KeychainItem) => boolean = inKeychain,
): readonly string[] => {
  if (process.platform === "darwin")
    return setups
      .flatMap((setup) => setup.keychain ?? [])
      .filter(holds)
      .map(({ service, account }) => `${service}:${account}`)
  if (process.platform !== "win32") return []
  const listed = execFileSync("cmdkey", ["/list"], { encoding: "utf8", windowsHide: true })
  return [...listed.matchAll(/target=([^\r\n]+)/gi)].map((match) => match[1]!.trim())
}

/**
 * The logins the setups' harnesses keep in this system's login store, as each setup's
 * `credentials` names them, among `targets`.
 */
export const harnessLogins = (
  setups: readonly Pick<AgentSetup, "credentials" | "keychain">[],
  targets: readonly string[] = credentialTargets(setups),
): readonly string[] =>
  targets.filter((target) =>
    setups.some((setup) => setup.credentials?.some((pattern) => pattern.test(target))),
  )
