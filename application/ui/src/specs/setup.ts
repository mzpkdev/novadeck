import { beforeEach } from "vitest"

import "../styles.css"

beforeEach(() => {
  // Closing a terminal a program runs in asks first; the person agrees unless a spec
  // answers otherwise.
  window.confirm = () => true
  localStorage.clear()
  window.history.replaceState(null, "", "/")
})
