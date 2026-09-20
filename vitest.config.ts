import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globalSetup: ["./scripts/test/compile/main.ts"],
    setupFiles: ["./src/renderer/src/test/setup.ts"],
    restoreMocks: true,
    watchTriggerPatterns: [
      {
        pattern: /src\/(?:main|preload|renderer)\//,
        testsToRun: () => ["./src/main/index.spec.ts"],
      },
    ],
  },
})
