import { resolve } from "node:path"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv, type ConfigEnv, type Plugin } from "vite"

import { contentSecurityPolicyConnectSources } from "./src/content-security-policy"

const connectSourcesPlaceholder = "__NOVADECK_CONNECT_SOURCES__"

const contentSecurityPolicy = (): Plugin => {
  let environment: ConfigEnv
  let apiUrl: string | undefined

  return {
    name: "novadeck-content-security-policy",
    config(_config, configEnvironment) {
      environment = configEnvironment
      const fileEnvironment = loadEnv(environment.mode, process.cwd(), "VITE_")
      apiUrl = process.env.VITE_API_URL ?? fileEnvironment.VITE_API_URL
    },
    transformIndexHtml(html) {
      if (!html.includes(connectSourcesPlaceholder)) {
        throw new Error("Content Security Policy connect-src placeholder is missing")
      }

      const sources = contentSecurityPolicyConnectSources(apiUrl, environment.command === "serve")
      return html.replace(connectSourcesPlaceholder, sources.join(" "))
    },
  }
}

export default defineConfig({
  base: "./",
  build: { manifest: true },
  optimizeDeps: {
    // Keep browser tests from discovering these dependencies after the runner starts.
    include: [
      "@tanstack/react-query",
      "zustand",
      "zustand/vanilla",
      "react-hotkeys-hook",
      "@orpc/client",
      "@orpc/client/standard",
      "@novadeck/protocol > @orpc/standard-server-peer",
      "@orpc/tanstack-query",
      "@novadeck/protocol > @orpc/contract",
      "@novadeck/protocol > zod",
      "@xterm/xterm",
      "@xterm/addon-fit",
    ],
  },
  plugins: [tailwindcss(), react(), contentSecurityPolicy()],
  resolve: {
    alias: [{ find: /^react$/, replacement: resolve("node_modules/react/index.js") }],
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:8787", ws: true } },
  },
})
