import { resolve } from "node:path"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: [{ find: /^react$/, replacement: resolve("node_modules/react/index.js") }],
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
})
