// Loaded only by the opt-in capture config; no timer, promise or input scheduling.
let activeCase = null
export const setCase = (index) => {
  activeCase = index
}
export const currentCase = () => activeCase
export const note = (stage, value = {}) => {
  window.dispatchEvent(
    new CustomEvent("novadeck:uninstall-capture", {
      detail: { stage, observedCase: activeCase, originCase: activeCase, ...value },
    }),
  )
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
