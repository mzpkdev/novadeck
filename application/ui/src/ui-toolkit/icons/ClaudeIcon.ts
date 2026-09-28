import { createLucideIcon } from "lucide-react"

// Clawd's stepped silhouette and four feet, simplified for a 14px window icon.
export const ClaudeIcon = createLucideIcon("Claude", [
  [
    "path",
    {
      d: "M4 4h16v4h2v5h-2v7h-2v-4h-2v4h-2v-5h-4v5H8v-4H6v4H4v-7H2V8h2Z",
      key: "critter",
      strokeLinejoin: "miter",
    },
  ],
  ["path", { d: "M8 9v2m8-2v2", key: "eyes", strokeWidth: 2, strokeLinecap: "butt" }],
])
