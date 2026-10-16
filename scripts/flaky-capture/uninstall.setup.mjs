import { afterEach, beforeEach, onTestFailed, onTestFinished } from "vitest"
import { commands } from "vitest/browser"

import { setCase } from "./uninstall-events.mjs"

let index = 0
let save = async () => {}
const state = () => {
  const dialog = document.querySelector('[role="alertdialog"]')
  if (!dialog) return null
  return {
    title: dialog.querySelector('h2,[data-part="title"]')?.textContent,
    alert: dialog.querySelector('[role="alert"]')?.textContent?.slice(0, 600) ?? null,
    buttons: [...dialog.querySelectorAll("button")].map((button) => ({
      name: button.textContent.trim().slice(0, 64),
      disabled: button.disabled,
    })),
    checkboxDisabled: dialog.querySelector('input[type="checkbox"]')?.disabled,
  }
}
beforeEach((context) => {
  index += 1
  const caseIndex = index
  setCase(caseIndex)
  const names = [context.task.name]
  for (let suite = context.task.suite; suite; suite = suite.suite) names.unshift(suite.name)
  const name = names.join(" > ")
  const began = performance.now()
  const timeOrigin = performance.timeOrigin
  const events = []
  let total = 0
  const record = (stage, value = {}) => {
    total += 1
    events.push({ ms: performance.now() - began, stage, ...value })
    if (events.length > 1000) events.shift()
  }
  let previous = ""
  const render = () => {
    const value = state()
    const key = JSON.stringify(value)
    if (key !== previous) {
      previous = key
      record("render", { state: value })
    }
  }
  const observed = (event) => record(event.detail.stage, event.detail)
  const native = (event) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null
    if (!button) return
    const action = button.textContent.trim()
    if (!button.closest('[role="alertdialog"]') && action !== "Uninstall…") return
    record("native", {
      type: event.type,
      action: action.slice(0, 64),
      disabled: button.disabled,
      trusted: event.isTrusted,
      x: event.clientX,
      y: event.clientY,
      button: event.button,
    })
  }
  const visibility = () =>
    record("visibility", { visibility: document.visibilityState, focused: document.hasFocus() })
  const observer = new MutationObserver(render)
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["disabled", "aria-disabled"],
  })
  const longTasks = PerformanceObserver.supportedEntryTypes.includes("longtask")
    ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          record("long-task", { startMs: entry.startTime - began, durationMs: entry.duration })
      })
    : undefined
  longTasks?.observe({ type: "longtask" })
  window.addEventListener("novadeck:uninstall-capture", observed)
  for (const type of ["pointerdown", "pointerup", "click"])
    window.addEventListener(type, native, true)
  document.addEventListener("visibilitychange", visibility)
  record("case-start", { visibility: document.visibilityState, focused: document.hasFocus() })
  render()
  const persist = () =>
    commands.uninstallCapture({
      index: caseIndex,
      name,
      timeOrigin,
      began,
      events,
      total,
      dropped: total - events.length,
    })
  save = persist
  onTestFailed(async () => {
    record("test-failed", { state: state() })
    await persist()
  })
  onTestFinished(async () => {
    record("test-finished", { state: state() })
    observer.disconnect()
    longTasks?.disconnect()
    window.removeEventListener("novadeck:uninstall-capture", observed)
    for (const type of ["pointerdown", "pointerup", "click"])
      window.removeEventListener(type, native, true)
    document.removeEventListener("visibilitychange", visibility)
    setCase(null)
    await persist()
  })
})
afterEach(async () => {
  await save()
})
