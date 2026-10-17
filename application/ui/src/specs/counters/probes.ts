// What the counter run counts, each from outside the code it watches: store listeners
// woken, DOM mutation records, and the components React renders on each commit.

export type Counts = {
  // Store listeners woken: each subscriber called once per change it hears of, in every
  // store `model/store` makes. A store built by hand elsewhere isn't counted.
  notifications: number
  // MutationObserver records anywhere under the page's body.
  mutations: number
  // Commits React made, and the components it rendered for them.
  commits: number
  renders: number
}

export const counts: Counts = { notifications: 0, mutations: 0, commits: 0, renders: 0 }

// Wraps a store module's factories so every listener a store calls counts as woken. It
// takes the module's exports as they are, so it needs no types of the stores it wraps.
export const countedStores = (module: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(module).map(([name, value]) => [
      name,
      typeof value === "function" && name.startsWith("create")
        ? (...input: unknown[]) => countedStore(value(...input))
        : value,
    ]),
  )

const countedStore = (store: unknown): unknown => {
  if (typeof store !== "object" || store === null || !("subscribe" in store)) return store
  const subscribe = store.subscribe as (listener: () => void) => () => void
  // One wrapper per listener, so subscribing it again stays one subscription, as it is
  // in the store's own set.
  const wrapped = new WeakMap<() => void, () => void>()
  const wrap = (listener: () => void): (() => void) => {
    const known = wrapped.get(listener)
    if (known) return known
    const counted = (): void => {
      counts.notifications += 1
      listener()
    }
    wrapped.set(listener, counted)
    return counted
  }
  return { ...store, subscribe: (listener: () => void) => subscribe(wrap(listener)) }
}

// Counts mutation records under the body from now on, each batch as its callback hears of
// it, until the returned stop.
export const observeMutations = (): (() => void) => {
  const observer = new MutationObserver((records) => {
    counts.mutations += records.length
  })
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  })
  return () => {
    counts.mutations += observer.takeRecords().length
    observer.disconnect()
  }
}

// The parts of a React fiber this reads; React gives no type for them.
type Fiber = {
  readonly tag: number
  readonly flags: number
  readonly child: Fiber | null
  readonly sibling: Fiber | null
  readonly alternate: Fiber | null
}

// Function, class, forwardRef and simple memo components: what a "render" calls.
const componentTags = new Set([0, 1, 11, 15])
// React's flag for a component that ran in this render and didn't bail out; one whose
// hooks found nothing changed goes uncounted.
const performedWork = 1

const children = function* (fiber: Fiber): Generator<Fiber> {
  for (let child = fiber.child; child; child = child.sibling) yield child
}

// Every component of a subtree mounted in this commit rendered.
const mounted = (fiber: Fiber): number =>
  (componentTags.has(fiber.tag) ? 1 : 0) +
  [...children(fiber)].reduce((sum, child) => sum + mounted(child), 0)

// A fiber updated in this commit rendered if its component ran; React leaves a subtree
// it skipped untouched, so a child list it kept as it was is not visited.
const updated = (fiber: Fiber, previous: Fiber): number => {
  const own = componentTags.has(fiber.tag) && (fiber.flags & performedWork) !== 0 ? 1 : 0
  if (fiber.child === previous.child) return own
  return (
    own +
    [...children(fiber)].reduce(
      (sum, child) => sum + (child.alternate ? updated(child, child.alternate) : mounted(child)),
      0,
    )
  )
}

// Stands in for React DevTools, which React reports each commit to. It must be in place
// before react-dom loads, so the spec installs it from `vi.hoisted`.
const devtoolsHook = "__REACT_DEVTOOLS_GLOBAL_HOOK__"
export const installRenderCount = (): void => {
  ;(globalThis as Record<string, unknown>)[devtoolsHook] = {
    supportsFiber: true,
    renderers: new Map(),
    // The renderer's id; the page has one.
    inject: () => 1,
    checkDCE: () => {},
    onScheduleFiberRoot: () => {},
    onCommitFiberUnmount: () => {},
    onPostCommitFiberRoot: () => {},
    onCommitFiberRoot: (_renderer: number, root: { current: Fiber }) => {
      counts.commits += 1
      const { current } = root
      counts.renders += current.alternate ? updated(current, current.alternate) : mounted(current)
    },
  }
}
