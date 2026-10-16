// Whether the visitor asked for less motion, as the app's animations read it.
export const lessMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
