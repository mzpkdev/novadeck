import type { CompanionKey } from "../../model/companion"
import type { Shown } from "./pane"
import type { CompanionHandle, PlanDoc } from "./state"

// Another terminal's item, placed on this terminal's bar: its id on this bar, where it
// came from and its id there, the terminal it's from as it's named, and that terminal's
// companion, which it loads and saves through. It stays that terminal's.
export type Guest = {
  readonly id: string
  readonly from: CompanionKey
  readonly item: string
  readonly origin: { readonly name: string; readonly handle?: string | undefined }
  readonly companion: CompanionHandle
} & (
  | { readonly kind: "plan"; readonly plan: PlanDoc }
  | { readonly kind: "artifact"; readonly artifact: Shown }
  | { readonly kind: "mail" }
)
