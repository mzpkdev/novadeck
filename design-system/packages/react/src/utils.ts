import type { CSSProperties } from "react"

export type ClassValue = string | false | null | undefined

export const cn = (...values: ClassValue[]): string => values.filter(Boolean).join(" ")

export type CustomProperties = CSSProperties & Record<`--${string}`, string | number | undefined>

export const withCustomProperties = (
  style: CSSProperties | undefined,
  properties: Record<`--${string}`, string | number | undefined>,
): CustomProperties => ({ ...style, ...properties })
