import { emptyCompanions, type CompanionKey } from "../../model/companion"
import { describe, expect, it } from "../../test"
import { forgetTerminal, guestId, place, placementsOf } from "./placement"

const session = { projectId: "p", workspaceSessionId: "s" }
const studio: CompanionKey = { ...session, terminalId: "01" }
const auth: CompanionKey = { ...session, terminalId: "03" }
const server: CompanionKey = { ...session, terminalId: "02" }

const where = (companions: ReturnType<typeof emptyCompanions>) =>
  placementsOf(companions).map(
    ({ from, item, to }) => `${from.terminalId}:${item}->${to.terminalId}`,
  )

describe("placing a terminal's item on another terminal's bar", () => {
  it("shows it on one bar at a time: placing it again moves it", () => {
    const companions = emptyCompanions()
    place(companions, studio, "hero", auth)
    place(companions, studio, "mail:", auth)
    place(companions, studio, "hero", server)
    expect(where(companions)).toEqual(["01:mail:->03", "01:hero->02"])
  })

  it("sends it home when it's placed on its own terminal's bar", () => {
    const companions = emptyCompanions()
    place(companions, studio, "plan:root", auth)
    place(companions, studio, "plan:root", studio)
    expect(where(companions)).toEqual([])
  })

  it("forgets what came from, or was shown on, a terminal that closed", () => {
    const companions = emptyCompanions()
    place(companions, studio, "hero", auth)
    place(companions, auth, "plan:root", server)
    place(companions, server, "mail:", studio)
    forgetTerminal(companions, auth)
    expect(where(companions)).toEqual(["02:mail:->01"])
  })

  it("names a placed item on its new bar apart from that terminal's own", () => {
    expect(guestId(studio, "hero")).toBe("guest:p/s/01#hero")
  })
})
