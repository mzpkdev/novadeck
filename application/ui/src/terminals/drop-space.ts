import { useSyncExternalStore } from "react"

import { createStore } from "../model/store"

// A view with free space to drop a window into, as Canvas has: where a point on screen
// lands in it, in its own units, with its zoom; null where the point isn't over its empty
// space. The view provides it while it's on screen.
export type DropSpace = (
  x: number,
  y: number,
) => { readonly x: number; readonly y: number; readonly zoom: number } | null

let provided: DropSpace | null = null

export const provideDropSpace = (space: DropSpace | null): void => {
  provided = space
}

export const dropSpaceAt = (x: number, y: number): ReturnType<DropSpace> => provided?.(x, y) ?? null

// Where a window dropped there now would sit, on screen, while something is dragged over
// the free space: the view draws its outline.
export const dropPreview = createStore<{
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
} | null>(null)

export const useDropPreview = (): ReturnType<typeof dropPreview.getSnapshot> =>
  useSyncExternalStore(dropPreview.subscribe, dropPreview.getSnapshot)

// A window was just dropped on the free space: where it asked to open, for the view to
// place the window that opens next there instead of somewhere free in view.
let requested: { readonly x: number; readonly y: number } | null = null

export const requestDropPlace = (place: { readonly x: number; readonly y: number }): void => {
  requested = place
}

export const takeDropPlace = (): { readonly x: number; readonly y: number } | null => {
  const place = requested
  requested = null
  return place
}
