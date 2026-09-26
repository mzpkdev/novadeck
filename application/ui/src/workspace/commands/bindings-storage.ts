import { commandDefinitions } from "./definitions"
import type { Shortcut } from "./definitions"
import type { BindingOverrides } from "./registry"

const key = "novadeck.command-bindings.v1"
const validBinding = (value: unknown): value is Shortcut => {
  if (!value || typeof value !== "object") return false
  const binding = value as Partial<Shortcut>
  return (
    typeof binding.key === "string" &&
    binding.key.length > 0 &&
    typeof binding.label === "string" &&
    typeof binding.ctrl === "boolean" &&
    typeof binding.meta === "boolean" &&
    typeof binding.shift === "boolean" &&
    (binding.code === undefined || typeof binding.code === "string") &&
    Array.isArray(binding.display) &&
    binding.display.every((item) => typeof item === "string")
  )
}

// A rebinding editor can use this seam later. Unknown commands and malformed
// values never acquire handlers or break the default bindings.
export const loadCommandBindings = (): BindingOverrides => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "{}")
    if (!stored || typeof stored !== "object") return {}
    const result: BindingOverrides = {}
    for (const { id } of commandDefinitions()) {
      const bindings = (stored as Record<string, unknown>)[id]
      if (Array.isArray(bindings) && bindings.length > 0 && bindings.every(validBinding))
        result[id] = bindings
    }
    return result
  } catch {
    return {}
  }
}
export const saveCommandBindings = (bindings: BindingOverrides): void => {
  localStorage.setItem(key, JSON.stringify(bindings))
}
