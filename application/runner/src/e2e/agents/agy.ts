import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { gemini } from "../model/gemini.js"
import type { AgentSetup } from "./agent.js"

/**
 * Antigravity against the fake model: its own folder in the sandbox's `~/.gemini`, seeded
 * past onboarding and its colour-scheme picker and trusting the project, and set to the
 * Gemini API with a key, as it runs without signing in. Signed in with Google it speaks
 * Code Assist instead, but takes its models only from an account's plan, which a fake
 * login can't name, so it never gets as far as a model call. Its updater is off.
 */
export const agy: AgentSetup = {
  agent: "agy",
  dialect: gemini,
  hosts: [
    "generativelanguage.googleapis.com",
    "cloudcode-pa.googleapis.com",
    "daily-cloudcode-pa.googleapis.com",
    "oauth2.googleapis.com",
    "accounts.google.com",
    "www.googleapis.com",
  ],
  prepare: async (sandbox, model) => {
    const home = join(sandbox.home, ".gemini", "antigravity-cli")
    await mkdir(home, { recursive: true, mode: 0o700 })
    await writeFile(
      join(home, "settings.json"),
      JSON.stringify({
        onboardingComplete: true,
        trustedWorkspaces: [sandbox.project],
        modelProvider: "gemini",
        // NovaDeck's MCP tools run without asking, so a `send` needs no approval (its
        // plugin's server is namespaced after the plugin), as does `sleep`, which keeps a
        // turn running while a message comes.
        permissions: { allow: ["mcp(novadeck_novadeck/*)", "command(sleep)"] },
      }),
    )
    return {
      GEMINI_API_KEY: model.credential,
      GOOGLE_GEMINI_BASE_URL: model.url,
      AGY_CLI_DISABLE_AUTO_UPDATE: "true",
    }
  },
}
