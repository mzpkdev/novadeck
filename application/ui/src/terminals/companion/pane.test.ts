import type { ArtifactRef } from "../../model/companion"
import { context, describe, expect, it } from "../../test"
import {
  close,
  dismiss,
  freshCount,
  moveSlot,
  arrived,
  mailTab,
  slotKey,
  openCompanion,
  pickFromGroup,
  planTab,
  reopen,
  reorderBar,
  arrange,
  type BarSlot,
  selectTab,
  show,
  slotsOf,
  type Companion,
} from "./pane"
import { shownTab } from "./state"

const ref = (id: string, kind: ArtifactRef["kind"], name = `${id}.png`): ArtifactRef => ({
  id,
  kind,
  name,
  detail: "",
  version: 1,
})
const image = (id: string): ArtifactRef => ref(id, "image")
const home = ref("home", "file", "Home.tsx")
const preview = ref("preview", "page", "localhost:5173")
const root = planTab("root")
const companion: Companion = { open: false, tab: root, home: root, artifacts: [] }

describe("companion pane", () => {
  context("when the agent shows something", () => {
    const shown = show(companion, home, false)

    it("waits, marked new, without opening", () => {
      expect(shown.open).toBe(false)
      expect(shown.tab).toBe(root)
      expect(freshCount(shown)).toBe(1)
    })

    it("lists each thing once", () => {
      expect(show(shown, home, false).artifacts).toHaveLength(1)
    })

    it("opens to what's new when no tab is chosen", () => {
      const opened = openCompanion(show(shown, preview, false))
      expect(opened.open).toBe(true)
      expect(opened.tab).toBe(preview.id)
      expect(freshCount(opened)).toBe(1)
    })
  })

  context("when the user asked for it", () => {
    it("opens straight to it, not new", () => {
      const shown = show(companion, home, true)
      expect(shown).toMatchObject({ open: true, tab: home.id })
      expect(freshCount(shown)).toBe(0)
    })
  })

  context("when a tab is looked at", () => {
    it("is no longer new", () => {
      expect(freshCount(selectTab(show(companion, home, false), home.id))).toBe(0)
    })
  })

  context("when the user closes something from the taskbar", () => {
    const ordered: Companion = { ...companion, tab: mailTab, order: [root, "home", mailTab] }

    it("lets what was shown go, as dismissing does", () => {
      const closed = close(show(ordered, home, false), "home")
      expect(closed.artifacts).toEqual([])
      expect(closed.closed).toBeUndefined()
    })

    it("keeps a plan or the messages, off the bar, the pane falling back", () => {
      const closed = close(close(ordered, mailTab), root)
      expect(closed.closed).toEqual([mailTab, root])
      expect(closed.order).toEqual(["home"])
    })

    it("hides the pane when it closes what the pane shows", () => {
      const open = { ...ordered, open: true }
      expect(close(open, mailTab).open).toBe(false)
      expect(close(open, root).open).toBe(true)
    })

    it("brings it back last when it reopens", () => {
      const reopened = reopen(close(ordered, root), root)
      expect(reopened.closed).toEqual([])
      expect(reopened.order).toEqual(["home", mailTab, root])
      expect(reopen(ordered, root)).toBe(ordered)
    })
  })

  context("when the user dismisses something", () => {
    it("leaves the pane, which falls back to the plan if it was showing it", () => {
      const dismissed = dismiss(show(companion, home, true), home.id)
      expect(dismissed.artifacts).toEqual([])
      expect(dismissed.tab).toBe(root)
    })
  })

  context("when the taskbar lays out its slots", () => {
    it("gives a lone image its own slot", () => {
      const shown = show(show(companion, image("hero"), false), home, false)
      expect(slotsOf(shown.artifacts).map((slot) => slot.kind)).toEqual(["one", "one"])
    })

    it("groups several images where the first one arrived", () => {
      let shown = show(companion, image("hero"), false)
      for (const next of [home, image("about"), preview]) shown = show(shown, next, false)
      const slots = slotsOf(shown.artifacts)
      expect(slots.map((slot) => slot.kind)).toEqual(["group", "one", "one"])
      expect(slots[0]).toMatchObject({
        of: "image",
        artifacts: [{ id: "hero" }, { id: "about" }],
      })
    })

    it("groups several files the same way, apart from the images", () => {
      const data = ref("data", "file", "projects.json")
      let shown = show(companion, home, false)
      for (const next of [image("hero"), data, image("about")]) shown = show(shown, next, false)
      const slots = slotsOf(shown.artifacts)
      expect(slots).toMatchObject([
        { kind: "group", of: "file", artifacts: [{ id: "home" }, { id: "data" }] },
        { kind: "group", of: "image", artifacts: [{ id: "hero" }, { id: "about" }] },
      ])
    })

    it("lays the bar out in the order things came, plans and messages among them", () => {
      let shown = show(companion, home, false)
      shown = arrived(shown, planTab("root"))
      shown = show(shown, image("hero"), false)
      shown = arrived(shown, mailTab)
      shown = show(shown, image("about"), false)
      const slots: BarSlot[] = [
        { kind: "plan", tab: planTab("root") },
        ...slotsOf(shown.artifacts),
        { kind: "mail" },
      ]
      // The images group sits where its first one came, before the messages.
      expect(arrange(shown, slots).map(slotKey)).toEqual([
        "home",
        planTab("root"),
        "group-image",
        mailTab,
      ])
    })

    it("moves a slot with its items, a group's together, anywhere on the bar", () => {
      let shown = arrived(companion, planTab("root"))
      for (const next of [image("hero"), home, image("about")]) shown = show(shown, next, false)
      shown = arrived(shown, mailTab)
      const bar = arrange(shown, [
        { kind: "plan", tab: planTab("root") },
        ...slotsOf(shown.artifacts),
        { kind: "mail" },
      ])
      // Messages to the front, then the plan to the end.
      let moved = reorderBar(shown, moveSlot(bar, 3, 0))
      moved = reorderBar(moved, moveSlot(arrange(moved, bar), 1, 3))
      expect(arrange(moved, bar).map(slotKey)).toEqual([
        mailTab,
        "group-image",
        "home",
        planTab("root"),
      ])
    })

    it("leaves what isn't on the bar where it was, and sends what's dismissed to the end", () => {
      let shown = show(companion, home, false)
      for (const next of [image("hero"), preview]) shown = show(shown, next, false)
      // The image is undocked: the bar holds Home.tsx and the preview, and swaps them.
      const onBar = slotsOf(shown.artifacts.filter((each) => each.id !== "hero"))
      const moved = reorderBar(shown, moveSlot(onBar, 1, 0))
      expect(moved.order).toEqual(["preview", "hero", "home"])
      // Dismissed and shown again, Home.tsx comes last.
      expect(show(dismiss(moved, "home"), home, false).order).toEqual(["preview", "hero", "home"])
      expect(show(dismiss(moved, "preview"), preview, false).order).toEqual([
        "hero",
        "home",
        "preview",
      ])
    })

    it("groups several pages too, as it does images and files", () => {
      const docs = ref("docs", "page", "localhost:6006")
      const shown = show(show(companion, preview, false), docs, false)
      expect(slotsOf(shown.artifacts)).toMatchObject([
        { kind: "group", of: "page", artifacts: [{ id: "preview" }, { id: "docs" }] },
      ])
    })

    it("stacks several plans, by their ids in the order they came", () => {
      const sub = planTab("sub")
      const ordered: Companion = { ...companion, order: [sub, "home", root] }
      const slots = arrange(ordered, [
        { kind: "plans", members: [sub, root] },
        ...slotsOf(show(ordered, home, false).artifacts),
      ])
      expect(slots.map(slotKey)).toEqual(["group-plans", "home"])
      expect(reorderBar(ordered, [slots[1]!, slots[0]!]).order).toEqual(["home", sub, root])
    })

    it("opens a group to what's new, else what's open, else the latest", () => {
      const two = show(show(companion, image("a"), false), image("b"), false)
      expect(pickFromGroup(two, two.artifacts).id).toBe("b")
      const read = selectTab(selectTab(two, "b"), "a")
      expect(pickFromGroup(read, read.artifacts).id).toBe("a")
      expect(pickFromGroup({ ...read, tab: root }, read.artifacts).id).toBe("b")
    })
  })

  context("when the agent shows something again", () => {
    it("takes its new version in place, new again", () => {
      const seen = selectTab(show(companion, home, false), home.id)
      const again = show(seen, { ...home, version: 2, detail: "lines 1–5" }, false)
      expect(again.artifacts).toMatchObject([
        { id: "home", version: 2, detail: "lines 1–5", fresh: true },
      ])
    })
  })

  describe("when it was shown before this session", () => {
    it("is listed as already seen, and opens nothing even if asked for", () => {
      const listed = show(companion, home, true, true)
      expect(listed).toMatchObject({ open: false, artifacts: [{ id: "home", fresh: false }] })
      expect(listed.tab).toBe(companion.tab)
    })
  })

  context("when what it shows may hold secrets", () => {
    const env: ArtifactRef = { ...ref("env", "file", ".env"), held: true }
    const key = { projectId: "p", workspaceSessionId: "s", terminalId: "t" }

    it("isn't what opening the pane goes to, though it's new", () => {
      const opened = openCompanion(show(show(companion, home, false), env, false))
      expect(opened.tab).toBe("home")
      expect(openCompanion(show(companion, env, false)).tab).toBe(root)
    })

    it("isn't what the pane falls back to when its plan or what it showed goes", () => {
      // The plan is gone, and the user dismissed what they read.
      const left = dismiss(
        selectTab(show(show(companion, env, false), home, false), "home"),
        "home",
      )
      expect(shownTab({ ...left, key, plans: [] }, false)).toBe("")
      expect(shownTab({ ...show(left, preview, false), key, plans: [] }, false)).toBe("preview")
    })

    it("isn't what a group of images opens, unless the group holds nothing else", () => {
      const qr: ArtifactRef = { ...image("qr"), held: true }
      const shots = show(show(companion, image("shot"), false), qr, false)
      const group = shots.artifacts.filter((shown) => shown.kind === "image")
      expect(pickFromGroup(shots, group).id).toBe("shot")
      const onlyHeld = show(companion, qr, false)
      expect(pickFromGroup(onlyHeld, onlyHeld.artifacts).id).toBe("qr")
    })

    it("shows when the user picks it", () => {
      const picked = selectTab(show(companion, env, false), "env")
      expect(shownTab({ ...picked, key, plans: [] }, false)).toBe("env")
    })
  })
})
