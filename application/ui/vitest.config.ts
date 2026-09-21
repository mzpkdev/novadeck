import { resolve } from "node:path"

import { mergeConfig } from "vite"
import { defineConfig } from "vitest/config"

import viteConfig from "./vite.config"

export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          find: "lucide-react",
          replacement: resolve(
            import.meta.dirname,
            "../../design-system/packages/react/node_modules/lucide-react/dist/esm/lucide-react.mjs",
          ),
        },
      ],
    },
    test: {
      environment: "jsdom",
      server: {
        deps: {
          inline: [/@ark-ui.*react/, /@zag-js.*react/, /lucide-react/],
        },
      },
      setupFiles: ["./src/test/setup.ts"],
      restoreMocks: true,
    },
  }),
)
