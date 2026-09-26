import { resolve } from "node:path"

import { defineConfig } from "electron-vite"

export default defineConfig({
  main: {
    ssr: {
      resolve: {
        // The headless terminal's module field points at its browser package's missing entry.
        mainFields: ["main", "module"],
      },
    },
    build: {
      rollupOptions: {
        input: resolve("src/main/index.ts"),
        // ws must resolve its optional native helpers through Node's real module loader.
        external: ["node-pty", "ws"],
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve("src/preload/index.ts"),
        output: {
          entryFileNames: "index.cjs",
          format: "cjs",
        },
      },
    },
  },
})
