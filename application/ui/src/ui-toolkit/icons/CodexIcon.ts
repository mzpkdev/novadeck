import { createLucideIcon } from "lucide-react"

// The robot's cloud-shaped head and screen face, without tiny decorative details.
export const CodexIcon = createLucideIcon("Codex", [
  [
    "path",
    {
      d: "M7 4a3 3 0 0 1 5-1 3.5 3.5 0 0 1 6 2 4 4 0 0 1 3 4v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V9a5 5 0 0 1 4-5Z",
      key: "head",
    },
  ],
  ["rect", { x: 6, y: 7, width: 12, height: 7, rx: 2, key: "screen" }],
  ["path", { d: "M9 10v1m6-1v1", key: "eyes", strokeWidth: 2 }],
  ["path", { d: "M8 17v3h8v-3M9 20v2m6-2v2", key: "body" }],
])
