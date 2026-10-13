// What the companion keeps of something it showed, to show it again at once: the latest
// few by key, the one kept longest ago going first once there are more.
export type Kept<Value> = {
  readonly get: (key: string) => Value | undefined
  readonly keep: (key: string, value: Value) => void
}

export const createKept = <Value>(limit: number): Kept<Value> => {
  const kept = new Map<string, Value>()
  return {
    get: (key) => kept.get(key),
    keep: (key, value) => {
      kept.delete(key)
      kept.set(key, value)
      for (const oldest of kept.keys()) {
        if (kept.size <= limit) break
        kept.delete(oldest)
      }
    },
  }
}
