import { resolve } from "node:path"

import { defineConfig } from "electron-vite"

export default defineConfig(({ command }) => ({
  main: {
    // In development, workspace packages that offer it (@novadeck/harness-core) load from
    // their sources, so an edit to them reaches `pnpm dev` without building them first.
    resolve: { conditions: command === "serve" ? ["development"] : [] },
    ssr: {
      resolve: {
        // @xterm/headless's module field points at a browser entry it does not ship.
        mainFields: ["main", "module"],
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
          // The runner runs in its own utility process.
          runner: resolve("src/runner/index.ts"),
          // The thread murmur redacts digests in, which the runner starts from a file beside it.
          murmurWorker: resolve("../runner/src/murmur/worker.ts"),
        },
        // Native PTYs load through Node's own resolver, from the unpacked package.
        external: ["node-pty"],
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
}))
