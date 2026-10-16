import { chromium, type CDPSession, type Page } from "playwright"

import type { Steady, Switch } from "./report.ts"
import type { Stack } from "./stack.ts"

// The scenario, as the measurement behind #206 ran it: 13 terminals in one session, the
// first 5 running the fake agent and the rest idle shells; Grid, then Focus, so every
// screen has been opened once; a steady window in each with every agent busy; then
// switches between terminals in Focus, busy and idle, kept and not, timed from the click
// to the target's screen painted.

export const scenario = {
  terminals: 13,
  agents: 5,
  warmMs: 5000,
  windowMs: 15_000,
  switchPasses: 2,
  switchTargets: [1, 8, 3, 12, 5, 9, 2, 13, 4, 7],
  viewport: { width: 1440, height: 900 },
} as const

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// What the page keeps for the run on `window`. Functions run in the page are sent there as
// source, so each reaches it through a cast of its own rather than a helper here.
type Probe = {
  benchTiming: { longTasks: number[]; frames: number[]; recording: boolean }
  benchSwitch: { clicked: number; painted: number | undefined }
}

// In the page before the app loads: long tasks as they happen, and each animation frame's
// time while a window records.
const probe = () => {
  const timing: Probe["benchTiming"] = { longTasks: [], frames: [], recording: false }
  ;(window as unknown as Probe).benchTiming = timing
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) timing.longTasks.push(entry.duration)
    }).observe({ type: "longtask" })
  } catch {
    // No long tasks to observe: the window reports none.
  }
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- Sent to the page as source.
  const loop = (time: number) => {
    if (timing.recording) timing.frames.push(time)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

const rows = "[data-terminal-tab-id]"

// The radio's input sits under its label, which takes the click.
const layout = (page: Page, name: "Grid" | "Focus") =>
  page
    .getByRole("radiogroup", { name: "Workspace layout" })
    .getByText(name, { exact: true })
    .click()

/** The phase of terminal `n`'s row (1-based), or null before it's there. */
const phase = (page: Page, n: number) =>
  page.evaluate(
    ([selector, index]) =>
      document.querySelectorAll(selector)[index]?.getAttribute("data-terminal-phase") ?? null,
    [rows, n - 1] as const,
  )

/** Whether a visible screen shows `text`. */
const shown = (page: Page, text: string) =>
  page.evaluate(
    (wanted) =>
      [...document.querySelectorAll(".xterm")].some((screen) => {
        const box = screen.getBoundingClientRect()
        return box.width > 0 && box.height > 0 && (screen.textContent ?? "").includes(wanted)
      }),
    text,
  )

const until = async (check: () => Promise<boolean>, ms: number): Promise<boolean> => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- Looks again until it holds.
    if (await check()) return true
    // eslint-disable-next-line no-await-in-loop -- As above.
    await sleep(250)
  }
  return false
}

/** Types `command` into the visible screen. */
const type = async (page: Page, command: string) => {
  const center = await page.evaluate(() => {
    const screen = [...document.querySelectorAll(".xterm")].find((each) => {
      const box = each.getBoundingClientRect()
      return box.width > 0 && box.height > 0
    })
    const box = screen?.getBoundingClientRect()
    return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : undefined
  })
  if (!center) throw new Error("no screen to type into")
  await page.mouse.click(center.x, center.y)
  await page.keyboard.type(command)
  await page.keyboard.press("Enter")
}

/** Where terminal `n`'s row is, scrolled into view first. */
const row = async (page: Page, n: number) => {
  await page.evaluate(
    ([selector, index]) =>
      document.querySelectorAll(selector)[index]?.scrollIntoView({ block: "nearest" }),
    [rows, n - 1] as const,
  )
  await sleep(150)
  return page.evaluate(
    ([selector, index]) => {
      const box = document.querySelectorAll(selector)[index]?.getBoundingClientRect()
      return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : undefined
    },
    [rows, n - 1] as const,
  )
}

/** Opens 13 terminals; the first 5 start the fake agent, the rest print a mark and idle. */
const setUp = async (page: Page, stack: Stack) => {
  for (let n = 1; n <= scenario.terminals; n += 1) {
    // eslint-disable-next-line no-await-in-loop -- One terminal after another, as a person opens them.
    await page.getByRole("button", { name: "New terminal" }).first().click()
    // Keys typed while it starts are lost.
    // eslint-disable-next-line no-await-in-loop -- As above.
    const started = await until(async () => {
      const now = await phase(page, n)
      return now !== null && now !== "starting"
    }, 30_000)
    if (!started) throw new Error(`terminal ${n} never started`)
    // eslint-disable-next-line no-await-in-loop -- As above.
    await sleep(500)
    const agent = n <= scenario.agents
    // eslint-disable-next-line no-await-in-loop -- As above.
    await type(
      page,
      agent ? `clear; ${stack.agent(n)}` : `clear; printf '[T%s] idle shell\\n' ${n}`,
    )
    // eslint-disable-next-line no-await-in-loop -- As above.
    const marked = await until(() => shown(page, `[T${n}]`), 15_000)
    if (!marked) throw new Error(`terminal ${n} never showed its mark`)
  }
}

/** Measures a steady window in `name`, every agent busy, after a warm-up. */
const steady = async (page: Page, cdp: CDPSession, name: Steady["layout"]): Promise<Steady> => {
  await layout(page, name)
  await sleep(scenario.warmMs)
  const task = async () =>
    (await cdp.send("Performance.getMetrics")).metrics.find(
      (metric) => metric.name === "TaskDuration",
    )?.value ?? 0
  const before = await task()
  const longTasks = await page.evaluate(() => {
    const { benchTiming } = window as unknown as Probe
    benchTiming.frames = []
    benchTiming.recording = true
    return benchTiming.longTasks.length
  })
  const started = Date.now()
  await sleep(scenario.windowMs)
  const { frames, tasks } = await page.evaluate((from) => {
    const { benchTiming } = window as unknown as Probe
    benchTiming.recording = false
    return { frames: benchTiming.frames, tasks: benchTiming.longTasks.slice(from) }
  }, longTasks)
  const seconds = (Date.now() - started) / 1000
  return {
    layout: name,
    seconds,
    taskSeconds: (await task()) - before,
    frameGaps: frames.slice(1).map((time, index) => time - frames[index]!),
    longTasks: tasks,
  }
}

/** Clicks terminal `target`'s row and times it until the target's screen paints. */
const switchTo = async (page: Page, target: number): Promise<Switch> => {
  const where = await row(page, target)
  if (!where) return { target, ms: undefined }
  await page.evaluate((tag) => {
    const timing: Probe["benchSwitch"] = { clicked: 0, painted: undefined }
    ;(window as unknown as Probe).benchSwitch = timing
    const visible = () =>
      [...document.querySelectorAll(".xterm")]
        .filter((screen) => {
          const box = screen.getBoundingClientRect()
          return box.width > 0 && box.height > 0
        })
        .some((screen) => (screen.textContent ?? "").includes(tag))
    const down = () => {
      document.removeEventListener("pointerdown", down, true)
      timing.clicked = performance.now()
      const step = () => {
        if (visible()) timing.painted = performance.now()
        else if (performance.now() - timing.clicked < 4000) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }
    document.addEventListener("pointerdown", down, true)
  }, `[T${target}]`)
  await page.mouse.click(where.x, where.y)
  const painted = await until(
    () => page.evaluate(() => (window as unknown as Probe).benchSwitch.painted !== undefined),
    4500,
  )
  const ms = painted
    ? await page.evaluate(() => {
        const { clicked, painted: at } = (window as unknown as Probe).benchSwitch
        return (at ?? clicked) - clicked
      })
    : undefined
  await sleep(700)
  return { target, ms }
}

/**
 * Runs the scenario in headless Chromium against `stack`, adding what it measures to
 * `measured` as it goes, so a run that fails part way keeps what it got.
 */
export const drive = async (
  stack: Stack,
  measured: { agentPhases: (string | null)[]; steady: Steady[]; switches: Switch[] },
): Promise<{ readonly chromium: string }> => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: scenario.viewport })
    await page.addInitScript(probe)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("Performance.enable")
    await page.goto(stack.url, { waitUntil: "load" })
    // The boot splash covers the app until it has connected to the runner.
    await page.locator(".boot-splash").waitFor({ state: "detached", timeout: 60_000 })
    await page
      .getByText("Skip for now")
      .click({ timeout: 15_000 })
      .catch(() => {})
    await layout(page, "Focus")
    await setUp(page, stack)
    for (let seed = 1; seed <= scenario.agents; seed += 1) stack.busy(seed, true)
    const agents = Array.from({ length: scenario.agents }, (_, index) => index + 1)
    const phases = () => Promise.all(agents.map((n) => phase(page, n)))
    await until(async () => (await phases()).every((each) => each === "running"), 15_000)
    measured.agentPhases.push(...(await phases()))
    measured.steady.push(await steady(page, cdp, "Grid"))
    measured.steady.push(await steady(page, cdp, "Focus"))
    for (let pass = 0; pass < scenario.switchPasses; pass += 1)
      for (const target of scenario.switchTargets)
        // eslint-disable-next-line no-await-in-loop -- One switch after another.
        measured.switches.push(await switchTo(page, target))
    for (let seed = 1; seed <= scenario.agents; seed += 1) stack.busy(seed, false)
    return { chromium: browser.version() }
  } finally {
    await browser.close()
  }
}
