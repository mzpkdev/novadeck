// Programs NovaDeck resumes in a fresh shell, by the session their agent reported,
// each with the plain command that continues it. Without a session there is nothing
// to resume: a program never starts with "continue the last one" instead.
const resumers = {
  claude: (session: string) => ["claude", "--resume", session],
  codex: (session: string) => ["codex", "resume", session],
} as const satisfies Record<string, (session: string) => readonly string[]>

export type ResumableProgram = keyof typeof resumers

// Takes a name from `programName`.
export const resumableProgram = (program: string | undefined): ResumableProgram | undefined =>
  program !== undefined && Object.hasOwn(resumers, program)
    ? (program as ResumableProgram)
    : undefined

// A session id is typed into the shell as it is, so it must be a plain token.
const session = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
// A bare command: plain words, with no quotes, paths, spaces within a word, or
// control characters, short enough to read at a glance.
const bare = /^[a-z][a-z0-9-]*(?: [A-Za-z0-9-][A-Za-z0-9._-]*)*$/
const maxLength = 200

// The command that resumes the program's session, typed at the fresh shell's prompt;
// undefined for a program without one or a session id that could not be typed safely.
export const resumeCommand = (program: string, sessionId: string): string | undefined => {
  const resumable = resumableProgram(program)
  if (!resumable || !session.test(sessionId)) return undefined
  const command = resumers[resumable](sessionId).join(" ")
  return command.length <= maxLength && bare.test(command) ? command : undefined
}
