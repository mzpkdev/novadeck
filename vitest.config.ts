import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.spec.ts"],
    restoreMocks: true,
    setupFiles: ["./scripts/test/setup.ts"],
  },
})
