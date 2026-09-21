import { mergeConfig } from "vite"
import { defineConfig } from "vitest/config"

import viteConfig from "./vite.config"

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      server: {
        deps: {
          inline: [/@ark-ui.*react/],
        },
      },
      setupFiles: ["./src/test/setup.ts"],
      restoreMocks: true,
    },
  }),
)
