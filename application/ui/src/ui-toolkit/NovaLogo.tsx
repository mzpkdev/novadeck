import { useId, type CSSProperties } from "react"

import { cn } from "../class-name"

// The Nova mark: four chevrons, < > ^ v, firing outward from a block cursor. It is a
// shape, not a style: the chevrons take the mark colour and the cursor the core colour,
// so each theme restyles it through tokens alone. The website's NovaMark.astro and the
// host's icons draw the same geometry; change them together. `size` is the whole square
// in pixels.
const chevrons = [
  { name: "right", points: "46,22 56,32 46,42" },
  { name: "left", points: "18,22 8,32 18,42" },
  { name: "up", points: "22,18 32,8 42,18" },
  { name: "down", points: "22,46 32,56 42,46" },
] as const

export const NovaMark = ({
  size = 28,
  animated = false,
  className,
}: {
  readonly size?: number
  // Assembles itself, as on the boot splash; still when motion is reduced.
  readonly animated?: boolean
  readonly className?: string | undefined
}): React.JSX.Element => (
  <svg
    aria-hidden="true"
    viewBox="3 3 58 58"
    width={size}
    height={size}
    className={cn("nova-mark flex-none", animated && "animated", className)}
  >
    <g fill="none" strokeWidth="7">
      {chevrons.map(({ name, points }) => (
        <polyline key={name} className={`nova-chevron ${name}`} points={points} />
      ))}
    </g>
    <rect className="nova-cursor" x="28" y="23" width="8" height="18" />
  </svg>
)

// The wordmark: "Nova" regular and "deck" semibold. Sized by the
// surrounding font size; `animated` raises it letter by letter.
export const DeckWordmark = ({
  animated = false,
  className,
}: {
  readonly animated?: boolean
  readonly className?: string | undefined
}): React.JSX.Element => {
  const letters = [
    ..."Nova".split("").map((letter) => ({ letter, className: "font-normal" })),
    ..."deck".split("").map((letter) => ({ letter, className: undefined })),
  ]
  return (
    <span
      className={cn(
        "deck-word inline-flex items-baseline font-semibold *:inline-block",
        animated && "animated",
        className,
      )}
      aria-hidden="true"
    >
      {letters.map(({ letter, className: letterClass }, index) => (
        <span
          // The letters never reorder.
          // oxlint-disable-next-line react/no-array-index-key
          key={index}
          className={letterClass}
          style={{ "--_i": index } as CSSProperties}
        >
          {letter}
        </span>
      ))}
    </span>
  )
}

const patternMask =
  "linear-gradient(to right, transparent 10%, black 78%), radial-gradient(ellipse at 100% 0%, black 10%, transparent 72%)"

// A quiet repeat of the layered terminal mark for branded backgrounds. It fades in
// from the right so foreground content can keep a clean reading surface.
export const DeckPattern = ({
  className,
}: {
  readonly className?: string | undefined
}): React.JSX.Element => {
  const id = useId().replaceAll(":", "")
  const pattern = `deck-pattern-${id}`
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 640 240"
      preserveAspectRatio="xMidYMid slice"
      style={{
        // Fades toward the left and away from the top-right corner, where the two
        // gradients overlap, so the pattern has no hard edge beside the copy.
        maskImage: patternMask,
        WebkitMaskImage: patternMask,
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
      }}
    >
      <defs>
        <pattern id={pattern} width="112" height="92" patternUnits="userSpaceOnUse">
          <g transform="rotate(-5 56 46)">
            <rect
              x="29"
              y="10"
              width="62"
              height="48"
              rx="3"
              fill="var(--color-paper)"
              fillOpacity="0.22"
              stroke="currentColor"
            />
            <rect
              x="22"
              y="17"
              width="62"
              height="48"
              rx="3"
              fill="var(--color-paper)"
              fillOpacity="0.34"
              stroke="currentColor"
            />
            <rect
              x="15"
              y="24"
              width="62"
              height="48"
              rx="3"
              fill="var(--color-paper)"
              fillOpacity="0.58"
              stroke="currentColor"
            />
            <path d="M15 36h62" stroke="currentColor" />
            <path
              d="m27 46 5 5-5 5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M39 57h9" fill="none" stroke="currentColor" strokeLinecap="round" />
          </g>
        </pattern>
      </defs>
      <rect width="640" height="240" fill={`url(#${pattern})`} />
    </svg>
  )
}

// The brand name for assistive technology, which the marks above leave out.
export const deckName = "Novadeck"
