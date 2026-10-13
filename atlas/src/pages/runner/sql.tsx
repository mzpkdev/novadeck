import type { ReactNode } from "react"

import { lens } from "./model.ts"

const keywords =
  /\b(SELECT|FROM|WHERE|INSERT(?: OR \w+)? INTO|VALUES|UPDATE|SET|DELETE FROM|ON CONFLICT|DO UPDATE SET|DO NOTHING|ORDER BY|GROUP BY|LIMIT|JOIN|LEFT JOIN|ON|AND|OR|NOT|IN|AS|IS|NULL|EXISTS|DISTINCT|CASE|WHEN|THEN|ELSE|END)\b/g

const tables = new RegExp(`\\b(${lens.tables.join("|")})\\b`, "g")

// SQL as mono text: keywords and table names picked out, nothing else.
export const Sql = ({ sql }: { sql: string }) => {
  const parts: ReactNode[] = []
  let last = 0
  const marks = [...sql.matchAll(keywords)].map((m) => ({ at: m.index, text: m[0], kind: "kw" }))
  for (const m of sql.matchAll(tables)) marks.push({ at: m.index, text: m[0], kind: "table" })
  marks.sort((a, b) => a.at - b.at)
  for (const mark of marks) {
    if (mark.at < last) continue
    if (mark.at > last) parts.push(sql.slice(last, mark.at))
    parts.push(
      mark.kind === "kw" ? (
        <span key={mark.at} style={{ color: "var(--color-syntax-keyword)" }}>
          {mark.text}
        </span>
      ) : (
        <span key={mark.at} className="font-semibold text-fg">
          {mark.text}
        </span>
      ),
    )
    last = mark.at + mark.text.length
  }
  parts.push(sql.slice(last))
  return (
    <code className="block font-mono text-[11.5px] leading-[17px] break-words text-muted">
      {parts}
    </code>
  )
}
