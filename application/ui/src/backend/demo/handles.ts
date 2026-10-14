// The handles a fresh session gives its terminals, in the order its runner does
// (application/runner/src/terminals/handles.ts), so the demo's terminals are known by the
// words a real session's would be: the first terminal's is `moth`, the second's `fox`.
const words = ["moth", "fox", "owl", "crow", "kite", "raven", "dusk", "volt"] as const

// The handle of a demo session's terminal by its number there, counted from 1.
export const demoHandle = (number: number): string => words[number - 1] ?? `${words[0]}${number}`
