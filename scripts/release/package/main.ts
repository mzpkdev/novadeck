import { appendFileSync, readFileSync } from "node:fs"

export function main(): void {
  const output = process.env.GITHUB_OUTPUT
  if (!output) throw new Error("GITHUB_OUTPUT is missing.")

  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as { version?: unknown }
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error("package.json version is missing.")
  }

  appendFileSync(output, `package=true\nversion=${manifest.version}\n`)
  console.log(`Packaging NovaDeck ${manifest.version}.`)
}

if (import.meta.main) {
  try {
    main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
