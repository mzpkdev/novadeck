// A plan is whatever Markdown the agent wrote. NovaDeck cannot dictate its shape: it shows
// the file's text and derives only what the text itself says. The design study keeps each
// sample revision as blocks, written out as the Markdown an agent would produce.

// A task item keeps whatever box the file has; NovaDeck reads it, never tracks it.
export type ListItem = {
  readonly id: string
  readonly text: string
  readonly task?: boolean
  readonly checked?: boolean
}

export type Block =
  | {
      readonly id: string
      readonly kind: "heading"
      readonly level: 1 | 2 | 3
      readonly text: string
    }
  | { readonly id: string; readonly kind: "paragraph" | "quote" | "code"; readonly text: string }
  | {
      readonly id: string
      readonly kind: "list"
      readonly ordered: boolean
      readonly items: readonly ListItem[]
    }
  | {
      readonly id: string
      readonly kind: "table"
      readonly head: readonly string[]
      readonly rows: readonly (readonly string[])[]
    }

export type PlanFile = {
  readonly id: string
  readonly path: string
  readonly agent: string
  // Whether NovaDeck's skill is installed for this agent. It tells the agent to re-read
  // the plan before acting on it, apply the notes left in it, and remove each one.
  readonly skill: boolean
  // Each revision the agent wrote, oldest first. The preview advances on feedback.
  readonly revisions: readonly (readonly Block[])[]
}

// The document's title is its first top-level heading, or failing that its file name.
export const titleOf = (path: string, text: string): string =>
  /^# (.+)$/m.exec(text)?.[1]?.trim() ?? path.split("/").at(-1) ?? path

// Headings below the title, with where each starts in the text. Fenced code is skipped,
// since a `#` there isn't a heading.
export const headingsOf = (text: string): { text: string; at: number }[] => {
  const headings: { text: string; at: number }[] = []
  let fenced = false
  let at = 0
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced
    const heading = !fenced && /^#{2,3} (.+)$/.exec(line)
    if (heading) headings.push({ text: heading[1]!.trim(), at })
    at += line.length + 1
  }
  return headings
}

// A structured plan, as some agents write them: headings, a task list, paths.
const studioV1: Block[] = [
  { id: "title", kind: "heading", level: 1, text: "A home for Studio" },
  {
    id: "intro",
    kind: "paragraph",
    text: "Build a lightweight site that introduces the studio, presents selected work, and gives potential collaborators a clear way to get in touch.",
  },
  { id: "direction-h", kind: "heading", level: 2, text: "Direction" },
  {
    id: "direction",
    kind: "paragraph",
    text: "Let the work lead. Pair generous space with expressive serif headlines, quiet navigation, and a warm ivory background.",
  },
  {
    id: "direction-quote",
    kind: "quote",
    text: "The interface should feel like a well-edited publication: calm, deliberate, and worth spending time with.",
  },
  { id: "scope-h", kind: "heading", level: 2, text: "Scope" },
  {
    id: "scope",
    kind: "table",
    head: ["Page", "What it needs to do"],
    rows: [
      ["Home", "Introduce the practice and lead into three selected projects."],
      ["Project", "Show the brief, approach, and outcome with a generous image layout."],
      ["About", "Explain how the studio works and offer a simple contact link."],
    ],
  },
  { id: "steps-h", kind: "heading", level: 2, text: "Steps" },
  {
    id: "steps",
    kind: "list",
    ordered: true,
    items: [
      {
        id: "step-1",
        task: true,
        text: "**Set the foundations.** Colour, type, and spacing tokens in `styles/tokens.css`; shared navigation and footer.",
      },
      {
        id: "step-2",
        task: true,
        text: "**Build the home page** in `pages/Home.tsx`: introduction, three selected projects, a short contact section.",
      },
      {
        id: "step-3",
        task: true,
        text: "**Create the project template** in `pages/Project.tsx`, with content kept in `content/projects.ts`.",
      },
      {
        id: "step-4",
        task: true,
        text: "**Refine the smaller layouts.** Stack the project grid on mobile and keep reading widths comfortable.",
      },
    ],
  },
  { id: "structure-h", kind: "heading", level: 2, text: "Structure" },
  {
    id: "structure",
    kind: "code",
    text: `src/
  components/  Navigation, Footer, ProjectCard
  pages/       Home, Project, About
  content/     Project descriptions and image references
  styles/      Tokens and shared layout rules`,
  },
  {
    id: "scope-note",
    kind: "paragraph",
    text: "Out of scope for this pass: CMS, contact forms, analytics, and deployment.",
  },
]

const studioV2: Block[] = studioV1.map((block) =>
  block.id === "direction"
    ? {
        ...block,
        text: "Let the work lead. Pair generous space with a confident grotesk for headlines, quiet navigation, and a warm ivory background.",
      }
    : block.kind === "list"
      ? {
          ...block,
          items: [
            ...block.items.slice(0, 1),
            {
              id: "step-2",
              task: true,
              text: "**Build the home page** in `pages/Home.tsx`: introduction, one featured project at full width, then a short contact section.",
            },
            ...block.items.slice(2),
            {
              id: "step-5",
              task: true,
              text: "**Add a Journal page** in `pages/Journal.tsx` for short studio notes.",
            },
          ],
        }
      : block,
)

// A prose plan, as other agents write them: no headings to speak of, no tasks.
const authV1: Block[] = [
  {
    id: "a1",
    kind: "paragraph",
    text: "I looked through how sessions are handled today. Tokens are minted in `server/auth.ts` and checked separately in three route files, each with slightly different expiry handling, which is why the mobile client sometimes logs out early.",
  },
  {
    id: "a2",
    kind: "paragraph",
    text: "I'd like to move all of it behind one `verifySession` helper and have every route call that. The helper would refresh tokens that are within five minutes of expiring, so the mobile client stops seeing sudden logouts.",
  },
  {
    id: "a3",
    kind: "paragraph",
    text: "This touches `server/routes/account.ts`, `server/routes/billing.ts` and `server/routes/admin.ts`. I won't change the token format, so existing sessions keep working. I'll add tests for the refresh window before changing the routes.",
  },
  {
    id: "a4",
    kind: "paragraph",
    text: "One open question: admin routes currently accept tokens for up to 24 hours. Should they follow the same rule, or keep a shorter window?",
  },
]

const authV2: Block[] = [
  ...authV1.slice(0, 3),
  {
    id: "a4",
    kind: "paragraph",
    text: "Admin routes will keep a shorter window: tokens older than one hour are rejected there even when the refresh would succeed elsewhere.",
  },
]

// A note as NovaDeck writes it into the file: invisible once rendered, marked for the
// agent's skill to find.
export const noteComment = (text: string): string => `<!-- novadeck: ${text} -->`

export const notePattern = /<!-- novadeck: (.*?) -->/g

export const notesIn = (text: string): number => [...text.matchAll(notePattern)].length

// The file the agent would have written, with any notes beside what they're about.
export const toMarkdown = (
  blocks: readonly Block[],
  notes: readonly { readonly anchor: string; readonly text: string }[] = [],
): string => {
  const notesOn = (id: string, indent = ""): string[] =>
    notes.filter((note) => note.anchor === id).map((note) => indent + noteComment(note.text))
  const lines = (block: Block): string[] => {
    switch (block.kind) {
      case "heading":
        return [`${"#".repeat(block.level)} ${block.text}`, ...notesOn(block.id)]
      case "paragraph":
        return [block.text, ...notesOn(block.id)]
      case "quote":
        return [`> ${block.text}`, ...notesOn(block.id)]
      case "code":
        return ["```", block.text, "```", ...notesOn(block.id)]
      case "table":
        return [
          `| ${block.head.join(" | ")} |`,
          `| ${block.head.map(() => "---").join(" | ")} |`,
          ...block.rows.map((row) => `| ${row.join(" | ")} |`),
          ...notesOn(block.id),
        ]
      case "list":
        return block.items.flatMap((item, index) => {
          const marker = block.ordered ? `${index + 1}. ` : "- "
          const box = item.task ? `[${item.checked ? "x" : " "}] ` : ""
          return [marker + box + item.text, ...notesOn(item.id, " ".repeat(marker.length))]
        })
    }
  }
  return `${blocks.map((block) => lines(block).join("\n")).join("\n\n")}\n`
}

export const samplePlans: Readonly<Record<string, PlanFile>> = {
  studio: {
    id: "studio",
    path: "plans/studio.md",
    agent: "Codex",
    skill: true,
    revisions: [studioV1, studioV2],
  },
  auth: {
    id: "auth",
    path: "~/.claude/plans/refactor-auth.md",
    agent: "Claude Code",
    skill: false,
    revisions: [authV1, authV2],
  },
}
