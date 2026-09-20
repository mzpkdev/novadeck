import { resolve } from "node:path"

import react from "@vitejs/plugin-react"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: [
        { find: "@renderer", replacement: resolve("src/renderer/src") },
        { find: /^react$/, replacement: resolve("node_modules/react/index.js") },
      ],
      dedupe: ["react", "react-dom"],
    },
    plugins: [react()],
  },
})
