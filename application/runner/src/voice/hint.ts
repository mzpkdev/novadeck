/**
 * What a terminal knows of the words likely said into it, as `Terminals.hintFacts` reads
 * them: its project's name, its folder, its git branch, the folders its agent writes in
 * most (absolute), the names of files shown beside it and written last, its agent's plan
 * title, the person's latest and first prompts there, and the start of the agent's last
 * reply.
 */
export type HintFacts = {
  readonly project: string | null
  readonly cwd: string
  readonly branch: string | null
  readonly folders: readonly string[]
  readonly files: readonly string[]
  readonly plan: string | null
  readonly prompts: readonly string[]
  readonly reply: string | null
}

/** How many names a hint lists after its project, branch and folder. */
export const hintTerms = 16
/**
 * The longest hint, in characters: well inside the 224 tokens Whisper reads of a prompt,
 * since a long one gets copied into the transcript, or makes it up.
 */
export const hintChars = 400

// Folder and branch names that say nothing of what the work is about.
const generic = new Set([
  "src",
  "lib",
  "dist",
  "build",
  "out",
  "bin",
  "node_modules",
  "test",
  "tests",
  "tmp",
  "main",
  "master",
  "trunk",
  "develop",
  "head",
])

const lastSegment = (path: string): string =>
  path
    .split(/[\\/]/)
    .findLast((part) => part.trim())
    ?.trim() ?? ""

/**
 * Whether a name would only mislead the engine: too short or long to be said, a commit or
 * an id rather than a word, a number, an address, or a folder every project has.
 */
const noise = (name: string): boolean => {
  const characters = [...name]
  if (characters.length < 2 || characters.length > 32) return true
  if (/^[0-9a-f]{7,}$/i.test(name) || /[0-9a-f]{8}-[0-9a-f]{4}/i.test(name)) return true
  const letters = characters.filter((each) => /\p{L}/u.test(each)).length
  if (letters === 0 || characters.filter((each) => /\d/.test(each)).length > letters) return true
  return /[@:]/.test(name) || generic.has(name.toLowerCase())
}

// A word spelled as code is: camelCase, snake_case, dotted or dashed, letters with digits,
// or capitals, as an acronym.
const codeLike = (word: string): boolean =>
  /\p{Ll}\p{Lu}/u.test(word) ||
  /\p{L}_|_\p{L}/u.test(word) ||
  /\p{L}[.-]\p{L}/u.test(word) ||
  /\p{L}\d|\d\p{L}/u.test(word) ||
  /^\p{Lu}{2,}$/u.test(word)

/**
 * The names in free text worth spelling: words spelled as code, and capitalised words
 * that don't start a sentence, as a product's name. Paths give their last segment, and a
 * word cut off by shortening is left out.
 */
const namesIn = (text: string): string[] => {
  const words = text.trim().split(/\s+/)
  if (text.trimEnd().endsWith("…")) words.pop()
  const names: string[] = []
  words.forEach((raw, index) => {
    const word = lastSegment(raw).replace(/^[^\p{L}\p{N}_]+|[^\p{L}\p{N}_]+$/gu, "")
    const opens = index === 0 || /[.!?:]["')\]]*$/.test(words[index - 1] ?? "")
    if (codeLike(word) || (!opens && /^\p{Lu}\p{Ll}/u.test(word))) names.push(word)
  })
  return names
}

/** A plan's title as a sentence: capitalised, ending in a stop, without a cut-off word. */
const sentence = (title: string): string | null => {
  const words = title.trim().split(/\s+/)
  if (title.trimEnd().endsWith("…")) words.pop()
  const text = words.join(" ").replace(/[\s.,;:]+$/, "")
  if (!text) return null
  const ended = /[.!?]$/.test(text) ? text : `${text}.`
  return ended.charAt(0).toUpperCase() + ended.slice(1)
}

const listed = (names: readonly string[], and: boolean): string =>
  and && names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
    : names.join(", ")

/**
 * The prompt that helps the engine spell what is said in a terminal: the names there, the
 * likeliest first, each once, without noise, cut to `hintTerms` and `hintChars`. Whisper
 * writes in its prompt's style, so they make a sentence, capitalised and punctuated: a
 * bare list of names gets back lowercase text without punctuation. Its words are English
 * only where the person speaks English (`language`), as the prompt would otherwise pull
 * the transcript towards English; for any other language, or `auto`, the names stand alone.
 */
export const dictationHint = (facts: HintFacts, language: string): string => {
  const english = language === "en"
  // Names already given, and a file's name without its extension, which says it as well.
  const seen = new Set<string>()
  const fresh = (name: string | null): string | null => {
    const key = name?.trim().toLowerCase()
    if (!name || !key || seen.has(key)) return null
    seen.add(key)
    seen.add(key.replace(/\.\p{L}{1,5}$/u, ""))
    return name.trim()
  }
  const project = fresh(facts.project?.trim() || null)
  const branchName = facts.branch === null ? "" : lastSegment(facts.branch)
  const branch = noise(branchName) ? null : fresh(branchName)
  const folderName = lastSegment(facts.cwd)
  const folder = noise(folderName) ? null : fresh(folderName)
  const candidates = [
    ...facts.folders.map(lastSegment),
    ...facts.files,
    ...facts.prompts.flatMap(namesIn),
    ...(english || facts.plan === null ? [] : namesIn(facts.plan)),
    ...(facts.reply === null ? [] : namesIn(facts.reply)),
  ]
  const terms: string[] = []
  for (const candidate of candidates) {
    if (terms.length === hintTerms) break
    const term = noise(candidate) ? null : fresh(candidate)
    if (term) terms.push(term)
  }
  const plan = english && facts.plan !== null ? sentence(facts.plan) : null
  const compose = (names: readonly string[]): string => {
    if (!english) {
      const head = [project, branch, folder].filter((part) => part !== null).join(", ")
      if (!names.length) return head ? `${head}.` : ""
      return head ? `${head}: ${names.join(", ")}.` : `${names.join(", ")}.`
    }
    const clauses = [
      project && `Working on ${project}`,
      branch && `on the ${branch} branch`,
      folder && `in the ${folder} folder`,
      names.length ? `with ${listed(names, true)}` : null,
    ].filter((clause) => clause !== null)
    // Without a project, the sentence starts at its next clause.
    const text = clauses.join(", ")
    return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}.` : ""
  }
  let kept = terms
  while (kept.length && compose(kept).length > hintChars) kept = kept.slice(0, -1)
  const hint = compose(kept)
  if (plan && hint.length + plan.length + 1 <= hintChars) return hint ? `${hint} ${plan}` : plan
  return hint
}
