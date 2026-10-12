import type { AnchorRef, Flow, FlowStep } from "../src/atlas.ts"

type CuratedStep = Omit<FlowStep, "anchor"> & { anchor: AnchorRef }

// Paths traced by hand through the code. `pnpm check` fails when an anchor stops resolving.
export const flows: (Omit<Flow, "steps"> & { steps: CuratedStep[] })[] = []
