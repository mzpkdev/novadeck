// Murmur reads terminal text, and terminals show secrets. These fixed rules strip what
// looks like one before the text reaches the model, by shape alone: nothing is learned or
// configured, so what leaves the machine's terminal is the same on every machine.
import type { Digest } from "./describer.js"

export const redacted = "[redacted]"

// Names that say their value is a secret. `tokens` and `author` are words, not secrets.
const secretName =
  /(secret|token(?!s)|passw|passphrase|credential|api[_-]?key|private[_-]?key|access[_-]?key|auth(?!or)|(^|[_-])key($|[_-])|cookie|session[_-]?id|signature)/i

const rules: readonly [RegExp, string | ((match: string, ...groups: string[]) => string)][] = [
  // A key block, or the start of one whose end scrolled away.
  [/-----BEGIN [A-Z0-9 ]*-----[\s\S]*?(-----END [A-Z0-9 ]*-----|$)/g, redacted],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, redacted],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, redacted],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, redacted],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, redacted],
  [/\bxox[abeoprs]-[A-Za-z0-9-]{10,}/g, redacted],
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*/g, redacted],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/gi, (_all, scheme) => `${scheme} ${redacted}`],
  // user:password@host in any URL.
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, (_all, scheme) => `${scheme}${redacted}@`],
  // NAME=value when the name sounds secret.
  [
    /\b([A-Za-z_][\w.-]*)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"',;&]+)/g,
    (all, name, joint) => (secretName.test(name) ? `${name}${joint}${redacted}` : all),
  ],
  // "name": "value", as JSON and YAML-ish dumps have it.
  [
    /(["'])([A-Za-z_][\w.-]*)\1(\s*:\s*)("[^"]*"|'[^']*')/g,
    (all, quote, name, joint) =>
      secretName.test(name) ? `${quote}${name}${quote}${joint}"${redacted}"` : all,
  ],
  // --password hunter2
  [
    /(--[\w-]*(?:token|secret|passw\w*|api-key|key)[\w-]*)\s+(?!-)(\S+)/gi,
    (_all, flag) => `${flag} ${redacted}`,
  ],
  // A commit id is 40 characters of hex and no secret; longer or shorter runs are hashes of one.
  [/\b[0-9a-f]{32,}\b/gi, (run) => (run.length === 40 ? run : redacted)],
  // Base64 long enough to hold a key; mixed case and a digit keeps words and paths out.
  [
    /(?<![\w/.+=-])[A-Za-z0-9+/_-]{40,}={0,2}(?![\w/.+-])/g,
    (run) => (/[a-z]/.test(run) && /[A-Z]/.test(run) && /\d/.test(run) ? redacted : run),
  ],
]

export const redact = (text: string): string => {
  let result = text
  for (const [pattern, replacement] of rules)
    result = result.replace(pattern, replacement as (substring: string) => string)
  return result
}

/** The digest with every string run through `redact`. */
export const redactDigest = (digest: Digest): Digest => {
  const one = (text: string | null): string | null => (text === null ? null : redact(text))
  const previous = digest.previous && {
    title: redact(digest.previous.title),
    summary: redact(digest.previous.summary),
  }
  if (digest.kind === "shell") {
    // The screen goes in whole, so a key block spanning rows is seen as one.
    const screen = redact(digest.screen.join("\n")).split("\n")
    return {
      ...digest,
      project: one(digest.project),
      folder: one(digest.folder),
      command: one(digest.command),
      screen,
      previous,
    }
  }
  return {
    ...digest,
    harness: redact(digest.harness),
    project: one(digest.project),
    folder: one(digest.folder),
    branch: one(digest.branch),
    plan: one(digest.plan),
    folders: digest.folders.map(redact),
    prompts: digest.prompts.map(redact),
    reply: one(digest.reply),
    previous,
  }
}
