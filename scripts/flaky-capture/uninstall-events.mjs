// Loaded only by the opt-in capture config; no timer, promise or input scheduling.
let activeCase = null
let total = 0
const events = []
export const setCase = (index) => {
  activeCase = index
}
export const currentCase = () => activeCase
export const timeline = () => ({
  timeOrigin: performance.timeOrigin,
  observedUntil: performance.now(),
  total,
  dropped: total - events.length,
  events: [...events],
})
export const note = (stage, value = {}) => {
  const detail = {
    now: performance.now(),
    stage,
    observedCase: activeCase,
    originCase: activeCase,
    ...value,
  }
  total += 1
  events.push(detail)
  if (events.length > 1000) events.shift()
  window.dispatchEvent(new CustomEvent("novadeck:uninstall-capture", { detail }))
}

export const sample = (read) => {
  try {
    const text = read()
    note("poll-sample", { present: true, text })
    return text
  } catch (error) {
    note("poll-sample", { present: false, error: error?.name })
    throw error
  }
}
