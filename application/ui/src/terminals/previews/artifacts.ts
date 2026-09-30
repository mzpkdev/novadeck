// What an agent shows the user beside its terminal, besides its plan: an image, a file
// from the project, a page in the preview browser. A terminal's companion pane keeps them
// in the order they came, after the plan. The design study mocks their content.

export type ArtifactKind = "image" | "file" | "page"

export type Artifact = {
  readonly id: string
  readonly kind: ArtifactKind
  readonly name: string
  readonly detail: string
}

// An artifact as the pane holds it: new until the user looks at it.
export type Shown = Artifact & { readonly fresh: boolean; readonly at: string }

// The pane's first tab is always the plan.
export const planTab = "plan"

export type Companion = {
  readonly open: boolean
  readonly tab: string
  readonly artifacts: readonly Shown[]
}

// The agent put something in front of the user. It waits in the taskbar unless the user
// asked for it, and then it opens.
export const show = <C extends Companion>(companion: C, artifact: Artifact, asked: boolean): C =>
  companion.artifacts.some((shown) => shown.id === artifact.id)
    ? companion
    : {
        ...companion,
        artifacts: [...companion.artifacts, { ...artifact, fresh: !asked, at: "just now" }],
        ...(asked ? { tab: artifact.id, open: true } : {}),
      }

// Looking at an artifact makes it old news.
export const selectTab = <C extends Companion>(companion: C, tab: string): C => ({
  ...companion,
  tab,
  open: true,
  artifacts: companion.artifacts.map((shown) =>
    shown.id === tab && shown.fresh ? { ...shown, fresh: false } : shown,
  ),
})

// Opening the pane without choosing a tab goes to what's new, if anything is.
export const openCompanion = <C extends Companion>(companion: C): C => {
  const fresh = companion.artifacts.findLast((shown) => shown.fresh)
  return fresh ? selectTab(companion, fresh.id) : { ...companion, open: true }
}

// The user is done with it: it leaves the pane, and the pane falls back to the plan.
export const dismiss = <C extends Companion>(companion: C, id: string): C => ({
  ...companion,
  tab: companion.tab === id ? planTab : companion.tab,
  artifacts: companion.artifacts.filter((shown) => shown.id !== id),
})

// A taskbar slot: one artifact, or every image, grouped as a taskbar groups an app's
// windows once there are several. Slots keep the order things first arrived in.
export type Slot =
  | { readonly kind: "one"; readonly artifact: Shown }
  | { readonly kind: "images"; readonly artifacts: readonly Shown[] }

export const slotsOf = (artifacts: readonly Shown[]): readonly Slot[] => {
  const images = artifacts.filter((shown) => shown.kind === "image")
  return artifacts.flatMap((artifact): Slot[] => {
    if (artifact.kind !== "image" || images.length < 2) return [{ kind: "one", artifact }]
    return artifact === images[0] ? [{ kind: "images", artifacts: images }] : []
  })
}

// Which of a group a click opens: what's new, else the one already open, else the latest.
export const pickFromGroup = (companion: Companion, group: readonly Shown[]): Shown =>
  group.findLast((shown) => shown.fresh) ??
  group.find((shown) => shown.id === companion.tab) ??
  group.at(-1)!

export const freshCount = (companion: Companion): number =>
  companion.artifacts.filter((shown) => shown.fresh).length

// The design study's samples: what each sample agent has shown, and will show next.
export const sampleArtifacts: Readonly<
  Record<string, { readonly shown: readonly Artifact[]; readonly next: readonly Artifact[] }>
> = {
  studio: {
    shown: [
      { id: "hero", kind: "image", name: "hero.png", detail: "1600 × 900 PNG" },
      { id: "about", kind: "image", name: "about.png", detail: "1600 × 900 PNG" },
    ],
    next: [
      {
        id: "home",
        kind: "file",
        name: "Home.tsx",
        detail: "src/pages/Home.tsx · lines 12–24",
      },
      { id: "preview", kind: "page", name: "localhost:5173", detail: "Dev server preview" },
      { id: "mobile", kind: "image", name: "home-mobile.png", detail: "390 × 844 PNG" },
    ],
  },
  auth: { shown: [], next: [] },
}

export const nextArtifact = (planId: string, companion: Companion): Artifact | undefined =>
  sampleArtifacts[planId]?.next.find(
    (artifact) => !companion.artifacts.some((shown) => shown.id === artifact.id),
  )

// The mocked file: `src/pages/Home.tsx`, with the lines the agent pointed at.
export const sampleFile = {
  path: "src/pages/Home.tsx",
  from: 12,
  to: 24,
  lines: [
    'import { ProjectCard } from "../components/ProjectCard"',
    'import { projects } from "../content/projects"',
    "",
    "export default function Home() {",
    "  const featured = projects.slice(0, 3)",
    "  return (",
    "    <main>",
    '      <Intro title="Careful work, made slowly." />',
    '      <section aria-label="Selected work">',
    "        {featured.map((project) => (",
    "          <ProjectCard key={project.slug} project={project} />",
    "        ))}",
    "      </section>",
    "      <Contact />",
    "    </main>",
    "  )",
    "}",
  ],
  firstLine: 9,
}
