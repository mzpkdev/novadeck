export type UninstallReport = {
  success?: boolean
  numTotalTests?: number
  numPassedTests?: number
  testResults?: {
    name?: string
    assertionResults?: { title?: string; status?: string }[]
  }[]
}
export type UninstallExecution = {
  pid: number
  began: number
  finished: boolean
  total: number
  dropped: number
  modules: { file: string; project: string; started: number }[]
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

export const uninstallTargetStatus = (report: UninstallReport): string | undefined => {
  const targets =
    report.testResults?.flatMap((file) =>
      /[\\/]uninstall\.spec\.tsx$/.test(file.name ?? "")
        ? (file.assertionResults ?? []).filter((test) => test.title === uninstallTarget)
        : [],
    ) ?? []
  return targets.length === 1 ? targets[0]!.status : undefined
}

export const validateQualityUninstallCapture = (
  report: UninstallReport,
  captures: readonly UninstallCapture[],
  execution: UninstallExecution,
  launched: number,
): string | undefined => {
  if (!report.testResults || report.testResults.length <= 1)
    return "Missing the broad UI suite report"
  if (
    !Number.isInteger(execution.pid) ||
    execution.pid <= 0 ||
    !execution.finished ||
    execution.began < launched ||
    execution.dropped !== 0 ||
    execution.total !== execution.modules.length
  )
    return "Missing, stale or truncated actual UI execution proof"
  const ran = (project: string, file: RegExp) =>
    execution.modules.some(
      (module) =>
        new RegExp(`^${project}(?: \\(chromium\\))?$`).test(module.project) &&
        module.started >= execution.began &&
        file.test(module.file) &&
        report.testResults!.some(
          (result) =>
            result.name?.replaceAll("\\", "/") === module.file &&
            result.assertionResults?.some(
              (test) => test.status === "passed" || test.status === "failed",
            ),
        ),
    )
  if (
    !ran("unit", /\/src\/.*\.test\.ts$/) ||
    !ran("behaviour", /\/src\/specs\/(?!uninstall\.spec\.tsx$).*\.spec\.tsx$/) ||
    !ran("motion", /\/src\/specs\/motion\.spec\.tsx$/)
  )
    return "All three original UI projects must actually execute"
  const files = report.testResults.filter((file) =>
    /[\\/]uninstall\.spec\.tsx$/.test(file.name ?? ""),
  )
  if (files.length !== 1 || !ran("behaviour", /\/src\/specs\/uninstall\.spec\.tsx$/))
    return "The original uninstall file must execute exactly once"
  if (
    execution.modules.filter((module) => module.file.endsWith("/src/specs/uninstall.spec.tsx"))
      .length !== 1
  )
    return "The original uninstall file must execute exactly once"
  const assertions = files[0]!.assertionResults ?? []
  if (uninstallTargetStatus(report) === "failed") {
    if (
      assertions.length !== 11 ||
      captures.length !== 11 ||
      captures.some((capture) => capture.dropped !== 0 || capture.sourceDropped !== 0)
    )
      return "Missing or truncated records for the failed uninstall file"
    const targets = captures.filter((capture) => capture.name?.endsWith(uninstallTarget))
    const events = targets[0]?.events ?? []
    if (
      targets.length !== 1 ||
      !events.some((event) => event.stage === "test-failed") ||
      !events.some((event) => event.stage === "confirm") ||
      !events.some((event) => event.stage === "poll-sample") ||
      !events.some((event) => event.stage === "render") ||
      !events.some((event) => event.stage === "fixture-scheduled" && event.delayMs === 1500) ||
      !events.some(
        (event) =>
          event.stage === "native" &&
          event.type === "click" &&
          event.action === "Uninstall" &&
          event.trusted,
      )
    )
      return "Missing the failed target's original click, timer or failure boundaries"
    return undefined
  }
  return validateUninstallCapture(
    {
      success: true,
      numTotalTests: assertions.length,
      numPassedTests: assertions.filter((test) => test.status === "passed").length,
      testResults: files,
    },
    captures,
  )
}

export type UninstallMetadata = {
  config: { scope?: string; pid?: number; projects?: { name?: string; testTimeout?: number }[] }
  browser: { version?: string; viewport?: { width?: number; height?: number } }
  sources: {
    total?: number
    dropped?: number
    observedUntil?: number
    finalFlush?: boolean
    events?: unknown[]
  }
  transforms: Record<
    string,
    { file?: string; incomingSourceSha256?: string; transformedSourceSha256?: string }
  >
}
export const validateQualityUninstallMetadata = (
  metadata: UninstallMetadata,
  execution: UninstallExecution,
): string | undefined => {
  if (
    metadata.config.scope !== "quality" ||
    metadata.config.pid !== execution.pid ||
    metadata.config.projects?.map((project) => project.name).join(",") !==
      "unit,behaviour,motion" ||
    metadata.config.projects.map((project) => project.testTimeout).join(",") !== "20000,30000,30000"
  )
    return "Missing original UI configuration/process identity"
  if (
    !metadata.browser.version ||
    metadata.browser.viewport?.width !== 1440 ||
    metadata.browser.viewport.height !== 900
  )
    return "Missing original browser identity/viewport"
  const sources = metadata.sources
  if (
    sources.dropped !== 0 ||
    !sources.total ||
    sources.events?.length !== sources.total ||
    typeof sources.observedUntil !== "number" ||
    sources.finalFlush !== true
  )
    return "Missing or truncated final source timeline"
  const expected = {
    "fixture.json": "application/ui/src/backend/demo/debug/uninstall.ts",
    "component.json": "application/ui/src/preferences/UninstallApp.tsx",
    "spec.json": "application/ui/src/specs/uninstall.spec.tsx",
  }
  if (
    Object.keys(metadata.transforms).toSorted().join(",") !==
    Object.keys(expected).toSorted().join(",")
  )
    return "Missing exact guarded transform manifests"
  for (const [name, file] of Object.entries(expected)) {
    const transform = metadata.transforms[name]
    if (
      transform?.file !== file ||
      !/^[a-f0-9]{64}$/.test(transform.incomingSourceSha256 ?? "") ||
      !/^[a-f0-9]{64}$/.test(transform.transformedSourceSha256 ?? "") ||
      transform.incomingSourceSha256 === transform.transformedSourceSha256
    )
      return "Invalid guarded transform identity"
  }
  return undefined
}

export const qualityUninstallResult = (
  native: { code: number; status: string },
  report: UninstallReport | undefined,
  issue: string | undefined,
  logDroppedBytes: number,
): {
  code: number
  status:
    | "passed"
    | "timeout"
    | "interrupted"
    | "target-failure"
    | "other-quality-failure"
    | "incomplete-capture"
  issue?: string
} => {
  const incomplete = logDroppedBytes > 0 ? "Root process log overflow" : issue
  const status =
    native.status === "timeout" || native.status === "interrupted"
      ? native.status
      : incomplete
        ? "incomplete-capture"
        : report && uninstallTargetStatus(report) === "failed"
          ? "target-failure"
          : native.code !== 0 || !report?.success
            ? "other-quality-failure"
            : "passed"
  return { code: status === "passed" ? 0 : 1, status, ...(incomplete ? { issue: incomplete } : {}) }
}
