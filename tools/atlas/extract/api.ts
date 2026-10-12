import type { Api } from "../src/atlas.ts"
import type { Anchors } from "./anchors.ts"

// Every procedure in the protocol contract, with its schemas, handler and callers.
export const extractApi = async (_repo: string, _anchors: Anchors): Promise<Api> => ({
  procedures: [],
  errors: [],
})
