// Exact boundaries in the original sources. A changed boundary fails capture closed.
const boundaries = [
  {
    file: "application/ui/src/backend/demo/debug/uninstall.ts",
    name: "fixture",
    edits: [
      {
        find: "return new Promise((resolve) => setTimeout(() => resolve(ends), uninstallMs))",
        count: 1,
        replace: `const attempt = runs.length
        const originCase = __uninstallCase()
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            __uninstallNote("fixture-fired", { originCase, attempt, kind: ends.kind })
            resolve(ends)
          }, uninstallMs)
          __uninstallNote("fixture-scheduled", { originCase, attempt, timer, delayMs: uninstallMs, kind: ends.kind })
        })`,
      },
    ],
  },
  {
    file: "application/ui/src/preferences/UninstallApp.tsx",
    name: "component",
    edits: [
      {
        find: "const keepData = dialog.keepData",
        count: 1,
        replace: `const originCase = __uninstallCase()
    __uninstallNote("confirm", { originCase, busy: dialog.busy, keepData: dialog.keepData })
    const keepData = dialog.keepData`,
      },
      {
        find: ".then((result) => setDialog((current) => current && settleUninstall(current, result)))",
        count: 1,
        replace: `.then((result) => {
        __uninstallNote("result", { originCase, kind: result.kind, reason: result.kind === "failed" ? result.reason : undefined })
        setDialog((current) => current && settleUninstall(current, result))
      })`,
      },
    ],
  },
  {
    file: "application/ui/src/specs/uninstall.spec.tsx",
    name: "spec",
    edits: [
      {
        find: '() => dialog().getByRole("alert").element().textContent',
        count: 2,
        replace: '() => __uninstallSample(() => dialog().getByRole("alert").element().textContent)',
      },
    ],
  },
] as const

export const instrumentUninstall = (source: string, id: string, events: string, setup?: string) => {
  const path = id.split("?")[0]!.replaceAll("\\", "/")
  const boundary = boundaries.find((item) => path.endsWith(`/${item.file}`))
  if (!boundary) return undefined
  let code = source
  for (const edit of boundary.edits) {
    const count = code.split(edit.find).length - 1
    if (count !== edit.count)
      throw new Error(
        `Uninstall capture boundary changed: ${boundary.file} (${count}/${edit.count})`,
      )
    code = code.replaceAll(edit.find, edit.replace)
  }
  const imports =
    boundary.name === "spec"
      ? "sample as __uninstallSample"
      : "note as __uninstallNote, currentCase as __uninstallCase"
  return {
    name: boundary.name,
    file: boundary.file,
    code: `${boundary.name === "spec" && setup ? `import ${JSON.stringify(setup)}\n` : ""}import { ${imports} } from ${JSON.stringify(events)}\n${code}`,
  }
}
