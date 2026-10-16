import {
  afterEach,
  describe as context,
  describe,
  expect,
  it,
  onTestFailed,
  onTestFinished,
} from "vitest"

import { pageScheme, saveFromAnotherWindow, systemScheme } from "./support/appearance"
import { motionDiagnostics } from "./support/motion-diagnostics"
import {
  commandInput,
  expectSelected,
  openWorkspace,
  press,
  terminal,
  terminalTab,
  view,
  viewSwitcher,
  labelled,
} from "./support/workspace"

// This project uses ordinary motion: the main behavior suite opts out of animations.
// Transitions finish; a running terminal's spinner and header sweep loop for as long as
// it runs, so they never count.
let motion: ReturnType<typeof motionDiagnostics> | undefined
const animationsFinished = async (phase: string): Promise<void> => {
  const wait = motion?.beginWait(phase)
  let pending: Record<string, unknown>[] = []
  onTestFailed(() =>
    console.error(
      "UI_PENDING_ANIMATIONS",
      JSON.stringify({
        visibility: document.visibilityState,
        pending,
      }),
    ),
  )
  await expect
    .poll(() => {
      const animations = document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === "running" &&
            animation.effect?.getTiming().iterations !== Infinity,
        )
      // Preserve the final sample even if cleanup removes its elements before the
      // failure hook. A count alone cannot identify a stuck transition or its clock.
      pending = animations.map((animation) => {
        const effect = animation.effect
        const target = effect instanceof KeyframeEffect ? effect.target : null
        return {
          id: animation.id,
          name: animation instanceof CSSAnimation ? animation.animationName : null,
          target: target instanceof Element ? target.outerHTML.slice(0, 250) : String(target),
          pseudo: effect instanceof KeyframeEffect ? effect.pseudoElement : null,
          currentTime: animation.currentTime,
          playbackRate: animation.playbackRate,
          pending: animation.pending,
          timing: effect?.getTiming(),
          computed: effect?.getComputedTiming(),
        }
      })
      motion?.sample(animations, pending, wait)
      return animations.length
    })
    .toBe(0)
  if (wait !== undefined) motion?.settled(wait)
}

const motionCase = (name: string, body: () => Promise<void>) => async () => {
  const capture = motionDiagnostics()
  motion = capture
  let closed = false
  const finish = (boundary: string) => {
    if (closed) return undefined
    closed = true
    if (motion === capture) motion = undefined
    const result = capture.stop()
    const text = JSON.stringify({
      name,
      boundary,
      diagnostic:
        result?.updateRejections || result?.callbackRejections
          ? "unexpected-update-rejection"
          : result?.pendingUpdates || result?.pendingCallbacks
            ? "incomplete-pending-update"
            : "observed",
      result,
    })
    const chunks = Math.ceil(text.length / 8000)
    for (let index = 0; index < chunks; index += 1)
      console.info(
        "UI_MOTION_DIAGNOSTICS",
        JSON.stringify({
          chunk: index + 1,
          chunks,
          data: text.slice(index * 8000, (index + 1) * 8000),
        }),
      )
    return result
  }
  // Timeout fallback; normal and assertion-failure snapshots happen before fixture cleanup.
  onTestFinished(() => {
    finish("after-case-hooks")
  })
  let result: ReturnType<typeof capture.stop>
  try {
    await body()
  } finally {
    result = finish("test-body-finally")
  }
  // Original errors propagate before this point; successful assertions cannot hide a failed update.
  if (result?.updateRejections || result?.callbackRejections)
    throw new Error("Motion capture observed an unexpected updateCallbackDone rejection")
  if (result?.pendingUpdates || result?.pendingCallbacks)
    throw new Error("Motion capture incomplete: updateCallbackDone remained pending at stop")
}

describe("workspace motion", () => {
  context("when moving a terminal between views", () => {
    it(
      "finishes the transition with its selection and input intact",
      motionCase("selection and input", async () => {
        expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false)
        expect(document.startViewTransition).toBeTypeOf("function")
        await openWorkspace()
        await terminalTab("Dev server").click()
        await commandInput("Dev server").fill("retained draft")

        await viewSwitcher().getByText("Grid", { exact: true }).click()
        await expect.element(view("Grid")).toBeChecked()
        await animationsFinished("Grid")
        await expectSelected("Dev server")
        await expect.element(commandInput("Dev server")).toHaveValue("retained draft")

        await terminal("Dev server")
          .getByRole("button", { name: labelled("Focus ", "Dev server") })
          .click()
        await expect.element(view("Focus")).toBeChecked()
        await animationsFinished("Focus")
        await expect.element(commandInput("Dev server")).toHaveValue("retained draft")
        await commandInput("Dev server").click()
        await press("!")
        await expect.element(commandInput("Dev server")).toHaveValue("retained draft!")
      }),
    )
  })

  context("when another view is requested during a transition", () => {
    it(
      "settles on the last requested view and remains interactive",
      motionCase("last requested view", async () => {
        await openWorkspace()
        await viewSwitcher().getByText("Grid", { exact: true }).click()
        await viewSwitcher().getByText("Canvas", { exact: true }).click()
        await expect.element(view("Canvas")).toBeChecked()
        await animationsFinished("Canvas")
        await expect.element(terminal("Checkout implementation")).toBeVisible()

        await viewSwitcher().getByText("Focus", { exact: true }).click()
        await expect.element(view("Focus")).toBeChecked()
        await animationsFinished("Focus")
        await commandInput("Checkout implementation").fill("still interactive")
        await expect
          .element(commandInput("Checkout implementation"))
          .toHaveValue("still interactive")
      }),
    )
  })
})

// Waits for the browser to draw this many frames, without reading a style on the way:
// a read would apply pending styles early and hide whether the page stilled them.
const frames = (count: number): Promise<void> =>
  new Promise((resolve) => {
    const next = (left: number): void => {
      if (left === 0) resolve()
      else requestAnimationFrame(() => next(left - 1))
    }
    next(count)
  })

// A surface that fades its ground over two seconds, as a control's hover does.
const fadingSurface = (): HTMLElement => {
  const surface = document.createElement("div")
  surface.style.cssText =
    "width: 40px; height: 40px; background-color: var(--color-paper); transition: background-color 2s linear"
  document.body.append(surface)
  expect(getComputedStyle(surface).transitionDuration).toBe("2s")
  return surface
}

describe("theme motion", () => {
  afterEach(() => systemScheme(null))

  context("when the system's scheme changes", () => {
    it("changes every colour at once instead of fading", async () => {
      await systemScheme("light")
      await openWorkspace()
      const surface = fadingSurface()
      const light = getComputedStyle(surface).backgroundColor

      await systemScheme("dark")
      await frames(3)

      expect(pageScheme()).toBe("dark")
      expect(surface.getAnimations()).toEqual([])
      expect(getComputedStyle(surface).backgroundColor).not.toBe(light)
      surface.remove()
    })
  })

  context("when another window chooses a mode", () => {
    it("changes every colour at once instead of fading", async () => {
      await systemScheme("light")
      await openWorkspace()
      const surface = fadingSurface()
      const light = getComputedStyle(surface).backgroundColor

      const saved = JSON.parse(localStorage.getItem("novadeck.preferences") ?? "{}")
      saveFromAnotherWindow("novadeck.preferences", {
        ...saved,
        appearance: { theme: "graphite", scheme: "dark" },
      })
      await frames(3)

      expect(pageScheme()).toBe("dark")
      expect(surface.getAnimations()).toEqual([])
      expect(getComputedStyle(surface).backgroundColor).not.toBe(light)
      surface.remove()
    })
  })
})
