export type UninstallReport = {
  success?: boolean
  numTotalTests?: number
  numPassedTests?: number
  testResults?: {
    name?: string
    assertionResults?: { title?: string; status?: string }[]
  }[]
}
export type UninstallCapture = {
  name?: string
  dropped?: number
  sourceDropped?: number
  events?: {
    stage?: string
    type?: string
    action?: string
    trusted?: boolean
    present?: boolean
    attempt?: number
    delayMs?: number
    state?: { alert?: string | null; buttons?: { name?: string; disabled?: boolean }[] }
  }[]
}
export const uninstallTarget =
  "keeps the advice of a failure after the terminals ended, on every retry"

export const validateUninstallCapture = (
  report: UninstallReport,
  captures: readonly UninstallCapture[],
): string | undefined => {
  const assertions = report.testResults?.flatMap((file) => file.assertionResults ?? []) ?? []
  if (
    !report.success ||
    report.numTotalTests !== 11 ||
    report.numPassedTests !== 11 ||
    report.testResults?.length !== 1 ||
    !/[\\/]uninstall\.spec\.tsx$/.test(report.testResults[0]?.name ?? "") ||
    assertions.length !== 11 ||
    assertions.some((item) => item.status !== "passed")
  )
    return "The complete original 11-case uninstall file did not pass"
  if (
    captures.length !== 11 ||
    captures.some((item) => item.dropped !== 0 || item.sourceDropped !== 0)
  )
    return "Missing or truncated per-case records"
  const target = captures.filter((item) => item.name?.endsWith(uninstallTarget))
  if (
    assertions.filter((item) => item.title === uninstallTarget).length !== 1 ||
    target.length !== 1
  )
    return "Missing or duplicated uninstall retry target"
  const events = target[0]!.events ?? []
  for (const stage of ["confirm", "fixture-scheduled", "fixture-fired", "result"])
    if (events.filter((event) => event.stage === stage).length !== 2)
      return `Missing both retry boundaries: ${stage}`
  const scheduled = events.filter((event) => event.stage === "fixture-scheduled")
  if (scheduled.some((event, index) => event.attempt !== index + 1 || event.delayMs !== 1500))
    return "Original 1500ms fixture timers were not observed in order"
  if (
    events.filter(
      (event) =>
        event.stage === "native" &&
        event.type === "click" &&
        event.action === "Uninstall" &&
        event.trusted,
    ).length !== 2
  )
    return "Missing both native uninstall clicks"
  if (events.filter((event) => event.stage === "poll-sample" && event.present).length < 2)
    return "Missing successful poll samples"
  if (
    !events.some(
      (event) =>
        event.stage === "render" &&
        event.state?.buttons?.some((button) => button.name === "Removing…" && button.disabled),
    ) ||
    !events.some(
      (event) =>
        event.stage === "render" &&
        event.state?.alert?.trim().endsWith("quit it and open it again."),
    )
  )
    return "Missing rendered busy/error transitions"
  return undefined
}
