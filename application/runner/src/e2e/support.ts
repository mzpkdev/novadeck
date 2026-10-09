/** What a developer sets to run the suite on their own Mac, knowing the Keychain is in reach. */
export const keychainOptIn = "NOVADECK_E2E_MACOS_KEYCHAIN"

/**
 * Why the suite can't run here, or undefined where it can: Linux and Windows always, macOS
 * in CI or when the developer opts in. On Linux the sandbox's dead D-Bus address keeps a
 * harness from the keyring. On Windows the sandbox moves the user's folders too (see
 * `createSandbox`) and each harness keeps its credentials in a file there. On macOS
 * nothing an environment moves keeps a harness from the login Keychain, which needs no
 * bus; CI's runners have nothing signed in to reach, but a developer's Mac may, so the
 * suite runs there only with `NOVADECK_E2E_MACOS_KEYCHAIN=accept`.
 */
export const unsupported = (
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string | undefined => {
  if (platform === "linux" || platform === "win32") return undefined
  if (platform !== "darwin")
    return `The end-to-end suite runs on Linux, Windows and macOS, not ${platform}`
  if (env.CI === "true" || env[keychainOptIn] === "accept") return undefined
  return `On macOS the end-to-end suite runs in CI only: nothing keeps a harness from the login Keychain, where your own Claude Code, Codex or Antigravity sign-in may be. Set ${keychainOptIn}=accept to run it here anyway`
}
