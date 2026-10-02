import { useSyncExternalStore } from "react"

import type { UndockPlace } from "../model/companion"
import { createStore } from "../model/store"

// On screen, where a dropped window would sit, at the view's scale (the canvas's zoom),
// and what it would show, for its ghost's header.
export type DropOutline = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
  readonly scale?: number | undefined
  readonly label?: string | undefined
}

// A view with free space to drop a window into, as Canvas and Grid have: for a point on
// screen over its free space, where a window dropped there opens and its outline; null
// elsewhere. The view provides it while it's on screen.
export type DropSpace = (
  x: number,
  y: number,
) => { readonly place: UndockPlace; readonly outline: DropOutline } | null

let provided: DropSpace | null = null

export const provideDropSpace = (space: DropSpace | null): void => {
  provided = space
}

export const dropSpaceAt = (x: number, y: number): ReturnType<DropSpace> => provided?.(x, y) ?? null

// The outline of where a window would sit, while something is dragged over free space:
// the view draws it.
export const dropPreview = createStore<DropOutline | null>(null)

export const useDropPreview = (): DropOutline | null =>
  useSyncExternalStore(dropPreview.subscribe, dropPreview.getSnapshot)

// A window was just dropped on the canvas: where it asked to open, for the canvas to
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
