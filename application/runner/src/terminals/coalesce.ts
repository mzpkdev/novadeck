/**
 * Runs `run` for a key once this tick, however often the key is changed within it, as a
 * burst of changes to one terminal's messages makes one listing for its watchers.
 */
export const coalesced = (run: (key: string) => void): ((key: string) => void) => {
  const scheduled = new Set<string>()
  return (key) => {
    if (scheduled.has(key)) return
    scheduled.add(key)
    setImmediate(() => {
      scheduled.delete(key)
      run(key)
    })
  }
}
