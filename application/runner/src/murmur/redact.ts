// Murmur reads terminal text, and terminals show secrets. These fixed rules strip what
// looks like one before the text reaches the model, by shape alone: nothing is learned or
// configured, so what leaves the machine's terminal is the same on every machine.
//
// Terminals wrap long lines, so a token may be split by a newline wherever the screen was
// wide enough to break it: the token rules allow one anywhere inside.
import type { Digest } from "./describer.js"

export const redacted = "[redacted]"

// A run of `characters` at least `min` long, each of which may be followed by a wrapping newline.
const wrapped = (characters: string, min: number): string => `(?:[${characters}]\\n?){${min},}`
// A literal that the screen may have wrapped anywhere inside.
const spaced = (literal: string): string =>
  [...literal].map((character) => `${character.replace(/[.\\-]/g, "\\$&")}\\n?`).join("")
// What replaces a token, keeping the newline that ended a wrapped run, which is not its own.
const mask = (run: string): string => (run.endsWith("\n") ? `${redacted}\n` : redacted)
const url = "A-Za-z0-9_\\-"

type Rule = readonly [RegExp, string | ((...match: string[]) => string)]

// Words that make a name a secret's wherever it is, and ones that do so only whole.
const secretInside = /(secret|passw|passphrase|apikey|privatekey|credential)/
const secretWords = new Set(["token", "pass", "pwd", "cookie", "bearer", "signature", "sig"])
// Words before `key`, which says what it opens: `api key`, but not `primary key` or `sort key`.
const keyOf = new Set([
  "api",
  "secret",
  "private",
  "access",
  "auth",
  "encryption",
  "signing",
  "license",
  "ssh",
  "account",
  "master",
  "client",
  "session",
])
// Words that end a name which only counts or points at a secret.
const notSecret = new Set([
  "count",
  "size",
  "budget",
  "limit",
  "length",
  "max",
  "min",
  "type",
  "name",
  "file",
  "path",
  "dir",
  "id",
  "ttl",
  "expiry",
  "expires",
  "url",
  "uri",
  "header",
  "field",
  "prefix",
])
// Values that say nothing: a setting, not a secret.
const plain = new Set([
  "true",
  "false",
  "null",
  "none",
  "nil",
  "undefined",
  "yes",
  "no",
  "on",
  "off",
  "required",
  "optional",
  "id",
  "name",
  "default",
  "auto",
  "string",
  "number",
  "bpe",
])

const sounds = (name: string): boolean => {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  const last = words.at(-1)
  // npm's `_auth` is a credential; a plain `auth` or `SSH_AUTH_SOCK` is not.
  if (/(^|_)_auth$/i.test(name) || /^_auth$/i.test(name)) return true
  if (last !== undefined && notSecret.has(last)) return last === "id" && words.includes("private")
  if (words.some((word) => secretInside.test(word))) return true
  if (words.some((word) => secretWords.has(word))) return true
  return words.some((word, index) => word === "key" && keyOf.has(words[index - 1] ?? ""))
}

// Whether `value` is worth hiding: not a path, a short number or a word like `true`.
const secretValue = (value: string): boolean => {
  const bare = value.replace(/^["']|["']$/g, "").trim()
  if (bare === "" || bare.includes(redacted)) return false
  if (/^[/~]|^\.\.?\//.test(bare)) return false
  if (/^\d{1,7}$/.test(bare)) return false
  // A reference, a placeholder or code that reads a secret from elsewhere is not one.
  if (/^(\$|<|\{\{|%[A-Za-z_]+%)/.test(bare)) return false
  if (/process\.env|os\.environ|import\.meta|getenv|secrets\./.test(bare)) return false
  if (/^[A-Za-z_][\w.]*\(/.test(bare)) return false
  if (/^[A-Za-z_]+(?:\.[A-Za-z_]+)+[,;)]?$/.test(bare)) return false
  return !plain.has(bare.toLowerCase())
}

const qualifies = (text: string): boolean => {
  if (text.length < 40 || !/[a-z]/.test(text) || !/[A-Z]/.test(text) || /[a-z]{7}/.test(text))
    return false
  const digits = text.replaceAll(/\D/g, "").length
  // Standard base64 has `+`, `/` and `=`, which words and identifiers don't. A path has words
  // between its slashes; a key's segments are not words.
  const marked = /[+/]|=$/.test(text)
  if (text.includes("/") && text.split("/").some((part) => /^[a-z]{4,}$/.test(part))) return false
  return marked ? digits >= 1 : digits >= 3
}

const quoted = `"[^"\\n]*"|'[^'\\n]*'`

const rules: readonly Rule[] = [
  // A key block, or the start of one whose end scrolled away.
  [/-----BEGIN [A-Z0-9 ]*-----[\s\S]*?(-----END [A-Z0-9 ]*-----|$)/g, redacted],
  // Tokens with a prefix of their own.
  [new RegExp(`(?<![\\w])${spaced("sk-")}${wrapped(url, 6)}`, "g"), mask],
  [
    new RegExp(`(?<![\\w])[sr]\\n?k\\n?_\\n?(?:live|test)\\n?_\\n?${wrapped("A-Za-z0-9", 8)}`, "g"),
    mask,
  ],
  [new RegExp(`(?<![\\w])g\\n?h\\n?[pousr]\\n?_\\n?${wrapped("A-Za-z0-9", 4)}`, "g"), mask],
  [new RegExp(`(?<![\\w])${spaced("github_pat_")}${wrapped("A-Za-z0-9_", 10)}`, "g"), mask],
  [new RegExp(`(?<![\\w])${spaced("glpat-")}${wrapped(url, 10)}`, "g"), mask],
  [new RegExp(`(?<![\\w])${spaced("hf_")}${wrapped("A-Za-z0-9", 16)}`, "g"), mask],
  [new RegExp(`(?<![\\w])${spaced("hvs.")}${wrapped(`${url}.`, 20)}`, "g"), mask],
  [new RegExp(`(?<![\\w])${spaced("npm_")}${wrapped("A-Za-z0-9", 20)}`, "g"), mask],
  [new RegExp(`(?<![\\w])${spaced("pypi-")}${wrapped("A-Za-z0-9_=-", 20)}`, "g"), mask],
  [new RegExp(`(?<![\\w])${spaced("AIza")}${wrapped(url, 30)}`, "g"), mask],
  [new RegExp(`(?<![\\w])SG\\.${wrapped(url, 16)}\\.${wrapped(url, 16)}`, "g"), mask],
  // A Discord bot token: three parts, the first the user id's digits in base64.
  [
    /(?<![\w.-])([A-Za-z0-9_-]{18,32})\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{25,}/g,
    (all, id) =>
      /^\d{17,20}$/.test(Buffer.from(id, "base64url").toString("utf8")) ? redacted : all,
  ],
  [new RegExp(`${spaced("AGE-SECRET-KEY-1")}${wrapped("A-Z0-9", 20)}`, "g"), mask],
  [new RegExp(`(?<![\\w])(?:AKIA|ASIA)(?:[0-9A-Z]\\n?){16}`, "g"), mask],
  [new RegExp(`(?<![\\w])xox[abeoprs]-${wrapped("A-Za-z0-9-", 10)}`, "g"), mask],
  [new RegExp(`(?<![\\w])eyJ(?:[\\w-]\\n?){8,}\\.(?:[\\w-]\\n?){8,}\\.(?:[\\w-]\\n?)*`, "g"), mask],
  // Webhooks carry their secret in the path.
  [
    /(hooks\.slack\.com\/services\/|discord(?:app)?\.com\/api\/webhooks\/)[^\s"'<>]+/gi,
    (_all, host) => `${host}${redacted}`,
  ],
  // user:password@host in any URL, even with no user and with a newline before the @.
  [
    /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]*:(?:[^\s/]*\n){0,6}[^\s/]*)@/gi,
    (all, scheme, info) => {
      // A newline after `host:port` is a line of output, and the next row begins with an @.
      if (info.includes("\n") && /^[\w.-]+:\d{1,5}$/.test(info.split("\n")[0] ?? "")) return all
      return `${scheme}${redacted}@`
    },
  ],
  // A key as the whole userinfo, as Sentry's DSN has it.
  [
    /\b([a-z][a-z0-9+.-]*:\/\/)(?:[A-Za-z0-9]{16,}|[A-Za-z0-9]{12,}(?=@[^\s/]*(?:sentry|ingest)))@/gi,
    (_all, scheme) => `${scheme}${redacted}@`,
  ],
  // A secret in a URL's query.
  [
    /([?&])([\w.-]+)=([^&\s#]+)/g,
    (all, mark, name, value) =>
      sounds(name) && secretValue(value) ? `${mark}${name}=${redacted}` : all,
  ],
  // Whole headers: the credential is everything after the name.
  [
    /\b(Authorization\s*[:=]\s*)(?:(?:Bearer|Basic|Token|Digest)\s+)?(?!\[redacted\])\S+/gi,
    (_all, head) => `${head}${redacted}`,
  ],
  [/\b((?:Set-)?Cookie\s*:[ \t]*)[^\n]+/gi, (_all, head) => `${head}${redacted}`],
  [
    /\b(Bearer|Basic)\s+((?:[A-Za-z0-9._~+/=-]\n?){4,})/gi,
    (all, scheme, value) =>
      /\d/.test(value) || value.length >= 16 ? `${scheme} ${mask(value)}` : all,
  ],
  // aws configure asks for the key by name.
  [/(\bSecret Access Key[^:\n]*:[ \t]*)(\S+)/gi, (_all, head) => `${head}${redacted}`],
  // AUTH=Basic dXNlcjpwYXNz, where the scheme says it is a credential.
  [
    /([=:][ \t]*)(Basic|Bearer)[ \t]+[A-Za-z0-9+/=._~-]{8,}/g,
    (_all, mark, scheme) => `${mark}${scheme} ${redacted}`,
  ],
  // Command lines that take a password in their own way.
  [/(\bredis-cli\b[^\n]*?\s-a\s+)(?!-)(\S+)/g, (_all, head) => `${head}${redacted}`],
  [/(\bhtpasswd\b[^\n]*?\s-\w*b\w*\s+\S+\s+\S+\s+)(\S+)/g, (_all, head) => `${head}${redacted}`],
  [/(\bopenssl\b[^\n]*?\s-k\s+)(?!-)(\S+)/g, (_all, head) => `${head}${redacted}`],
  [/(\bopenssl\b[^\n]*?\s-pass(?:in|out)?\s+pass:)(\S+)/g, (_all, head) => `${head}${redacted}`],
  [
    /(\b(?:mysql|mysqladmin|mysqldump)\w*\b[^\n]*?\s-p)(?=\S)(\S+)/g,
    (_all, head) => `${head}${redacted}`,
  ],
  [
    /(\b(?:docker\s+login|sshpass)\b[^\n]*?\s-p\s+)(?!-)(\S+)/g,
    (_all, head) => `${head}${redacted}`,
  ],
  [/(\bcurl\b[^\n]*?\s(?:-u|--user)[ =]\s*)(?!-)(\S+)/g, (_all, head) => `${head}${redacted}`],
  // --password hunter2, by the flag's exact name.
  [
    /(--(?:password|passwd|pass|pwd|token|auth-token|access-token|api-key|apikey|secret|client-secret|auth|bearer|credentials?|passphrase))(?:=|[ \t]+)(?!-)(\S+)/gi,
    (all, flag, value) =>
      secretValue(value) ? `${all.slice(0, flag.length + 1)}${redacted}` : all,
  ],
  // NAME=value, where the name sounds secret; a value that fills the row goes on in the next.
  [
    new RegExp(
      `(?<![\\w.-])([A-Za-z_][\\w.-]*)([ \\t]*\\n?[ \\t]*=[ \\t]*)(${quoted}|[^\\s"',;&]+)((?:\\n[^\\s"',;&]+)*)`,
      "g",
    ),
    (all, name, joint, value, rest) => {
      if (!sounds(name) || !secretValue(value)) return all
      // A row is a continuation while the one before it ran to the screen's edge.
      const rows = rest === "" ? [] : rest.slice(1).split("\n")
      let before = `${name}${joint}${value}`
      let used = 0
      while (used < rows.length && used < 8 && before.length >= 20) {
        before = rows[used] ?? ""
        used += 1
      }
      const left = rows.slice(used)
      return `${name}${joint}${redacted}${left.length > 0 ? `\n${left.join("\n")}` : ""}`
    },
  ],
  // fish: set -x NAME value
  [
    /(\bset[ \t]+(?:-\w+[ \t]+)*)([A-Za-z_]\w*)([ \t]+)(?!-)(\S+)/g,
    (all, head, name, gap, value) =>
      sounds(name) && secretValue(value) ? `${head}${name}${gap}${redacted}` : all,
  ],
  // "name": "value", as JSON has it, and 'name': 'value'.
  [
    new RegExp(`(["'])([A-Za-z_][\\w.-]*)\\1([ \\t]*:[ \\t]*)(${quoted}|[^\\s,}\\]]+)`, "g"),
    (all, quote, name, joint, value) =>
      sounds(name) && secretValue(value) ? `${quote}${name}${quote}${joint}"${redacted}"` : all,
  ],
  // name: value, as YAML and headers have it.
  [
    new RegExp(`(?<![\\w.-])([A-Za-z_][\\w.-]*)([ \\t]*:[ \\t]+)(${quoted}|[^\\s"',;]+)`, "g"),
    (all, name, joint, value) =>
      sounds(name) && secretValue(value) ? `${name}${joint}${redacted}` : all,
  ],
  // A hash of a secret is as good as the secret; a commit id or a file's checksum is not one.
  [
    /(?<![0-9a-zA-Z_])(?<!sha(?:1|256|512)[:-])(?<!commit )(?<!diff-)(?:[0-9a-f]\n?){32,}(?![0-9a-zA-Z_])(?!\s{2}\S)/gi,
    (run) => {
      const length = run.replaceAll("\n", "").length
      return length === 40 || length === 44 ? run : mask(run)
    },
  ],
  // Base64 long enough to hold a key. Paths, words and identifiers are long and mixed too:
  // a run needs several digits and no long word in it, and is never part of a path. Rows of
  // ordinary text beside a wrapped key stick to the run, so the part that qualifies is found.
  [
    /(?<![\w/\\.+=-])(?<!;base64,)(?!sha(?:1|256|384|512)-)(?:[A-Za-z0-9+/_-]\n?){40,}={0,2}(?![\w\\.+-])/g,
    (run) => {
      const rows = run.split("\n")
      let best: [number, number] | undefined
      for (let from = 0; from < rows.length; from += 1)
        for (let to = rows.length; to > from; to -= 1) {
          const text = rows.slice(from, to).join("")
          if (!qualifies(text)) continue
          if (!best || text.length > rows.slice(best[0], best[1]).join("").length) best = [from, to]
          break
        }
      if (!best) return run
      const [from, to] = best
      const tail = to === rows.length ? "" : "\n"
      return [
        ...rows.slice(0, from),
        `${redacted}${tail === "" && run.endsWith("\n") ? "\n" : ""}`,
        ...rows.slice(to),
      ]
        .join("\n")
        .replace(/\n\n$/, "\n")
    },
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
  const previous = digest.previous && { title: redact(digest.previous.title) }
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
    summary: one(digest.summary),
    previous,
  }
}
