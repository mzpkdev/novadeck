import { resolve } from "node:path"

import { defineConfig } from "electron-vite"

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: resolve("src/main/index.ts"),
      },
    },
  },
})
