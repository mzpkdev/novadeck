import type { Backend } from "../port"
import { contentDemo } from "./content"
import type { DemoSurfaceRuntime } from "./debug/types"
import { plainDemo, type PlainVariant } from "./index"

// The demos the content preview can run: the content showcase, and the plain ones.
export type DemoVariant = "showcase" | PlainVariant

export const demoVariants: readonly DemoVariant[] = [
  "showcase",
  "plain",
  "agents",
  "messages",
  "welcome",
]

export const createDemo = (variant: DemoVariant, runtime?: DemoSurfaceRuntime): Backend =>
  variant === "showcase" ? contentDemo(runtime) : plainDemo(variant, runtime)

// The variant the address's hash asks for with `?demo=`; the showcase otherwise.
export const requestedVariant = (): DemoVariant => {
  const demo = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("demo")
  return demoVariants.find((variant) => variant === demo) ?? "showcase"
}

// Puts the variant in the address, so a reload keeps it, and the app at its start page.
// The router does not hear it: the next boot reads the address afresh.
export const rememberVariant = (variant: DemoVariant): void => {
  window.history.replaceState(null, "", `#/?demo=${variant}`)
}
