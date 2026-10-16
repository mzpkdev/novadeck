// An animation that never ends keeps running for as long as its element is on screen, so
// it must be one the compositor can run alone: its keyframes change only `transform`,
// `translate`, `rotate`, `scale`, `opacity` or `filter`. Anything else, as `content` or
// `background-position`, repaints on the main thread every frame (performance rule 12).

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "../test"

const src = join(process.cwd(), "src")
const stylesheets = (readdirSync(src, { recursive: true }) as string[])
  .map((file) => file.split("\\").join("/"))
  .filter((file) => file.endsWith(".css"))
const read = (file: string): string =>
  readFileSync(join(src, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

const compositable = new Set(["transform", "translate", "rotate", "scale", "opacity", "filter"])

// The text between the brace that opens at `open` and the one that closes it.
const blockAt = (css: string, open: number): string => {
  let depth = 0
  for (let index = open; index < css.length; index++) {
    if (css[index] === "{") depth++
    else if (css[index] === "}" && --depth === 0) return css.slice(open + 1, index)
  }
  return css.slice(open + 1)
}

// Every `@keyframes` in the stylesheets, by name, with the properties its frames set.
const keyframes = new Map<string, { readonly file: string; readonly properties: Set<string> }>(
  stylesheets.flatMap((file) => {
    const css = read(file)
    return [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)].map((match) => {
      const body = blockAt(css, match.index + match[0].length - 1)
      const properties = new Set(
        [...body.matchAll(/([\w-]+)\s*:[^;{}]*[;}]/g)]
          .map((declaration) => declaration[1]!)
          .filter((property) => property !== "animation-timing-function"),
      )
      return [match[1]!, { file, properties }] as const
    })
  }),
)

// What isn't an animation's name in its shorthand: keywords, times, counts and functions.
const keywords = new Set(
  "infinite normal reverse alternate alternate-reverse none forwards backwards both running paused linear ease ease-in ease-out ease-in-out step-start step-end".split(
    " ",
  ),
)
const nameOf = (tokens: readonly string[]): string | undefined =>
  tokens.find((token) => !keywords.has(token) && !/^[\d.-]/.test(token) && !token.includes("("))

// The layers of a shorthand, split at the commas outside any function.
const layers = (value: string): string[] => {
  const found: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < value.length; index++) {
    if (value[index] === "(") depth++
    else if (value[index] === ")") depth--
    else if (value[index] === "," && depth === 0) {
      found.push(value.slice(start, index))
      start = index + 1
    }
  }
  return [...found, value.slice(start)]
}

// The keyframes each `animation` layer that repeats forever runs, with where it is set.
// Functions are dropped before the layer is split into tokens, so `steps(1)` is no name.
const infinite = stylesheets.flatMap((file) =>
  [...read(file).matchAll(/(?:^|[\s;{])animation\s*:([^;{}]+)/g)].flatMap((match) =>
    layers(match[1]!).flatMap((layer) => {
      const tokens = layer
        .replace(/[\w-]*\([^()]*(?:\([^()]*\)[^()]*)*\)/g, " ")
        .trim()
        .split(/\s+/)
      const name = tokens.includes("infinite") ? nameOf(tokens) : undefined
      return name ? [{ file, name }] : []
    }),
  ),
)

describe("animations that never end", () => {
  it("are found in the stylesheets", () => {
    expect(infinite.length).toBeGreaterThan(0)
  })

  it("run keyframes the stylesheets define", () => {
    const unknown = infinite.filter(({ name }) => !keyframes.has(name))
    expect(unknown.map(({ file, name }) => `${file}: ${name}`)).toEqual([])
  })

  it("change only what the compositor runs alone: transform, translate, rotate, scale, opacity or filter", () => {
    const offenders = [...new Set(infinite.map(({ name }) => name))].flatMap((name) => {
      const frames = keyframes.get(name)
      const painted = [...(frames?.properties ?? [])].filter(
        (property) => !compositable.has(property),
      )
      return frames && painted.length
        ? [`${frames.file}: @keyframes ${name} sets ${painted.join(", ")}`]
        : []
    })
    expect(offenders).toEqual([])
  })
})
