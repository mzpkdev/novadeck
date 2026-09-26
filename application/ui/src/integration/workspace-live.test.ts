import type { Page } from "playwright"
import { describe, expect, it } from "vitest"

import { startLiveBrowser } from "./live-browser"

const text = (page: Page) => page.locator("[data-terminal] .xterm-accessibility-tree")
const output = async (page: Page, value: string): Promise<void> => {
  await text(page).filter({ hasText: value }).waitFor({ state: "attached" })
}
const command = async (page: Page, value: string): Promise<void> => {
  await page.locator("[data-terminal] .xterm-helper-textarea").focus()
  await page.keyboard.type(value)
  await page.keyboard.press("Enter")
}
const chooseView = async (page: Page, name: string, mounted = true): Promise<void> => {
  // Ark's radio input is intentionally hidden; its visible label is the UI control.
  const radio = page.getByRole("radio", { name, exact: true })
  const id = await radio.getAttribute("id")
  if (!id) throw new Error("View control needs an accessible label")
  await page.locator(`label[for="${id}"]`).click()
  if (mounted) await page.locator("[data-terminal] .xterm-screen").waitFor()
}
const variable = (name: string) => (process.platform === "win32" ? `%${name}%` : "${" + name + "}")

describe("real terminal workspace", () => {
  it("authenticates, creates a shell and preserves it through layouts and a dropped connection", async () => {
    const live = await startLiveBrowser()
    const { page } = live
    try {
      await page.goto(live.origin)
      await page.getByRole("heading", { name: "Connect to your runtime" }).waitFor()
      await page.getByLabel("Access token").fill("invalid-test-token")
      await page.getByRole("button", { name: "Connect", exact: true }).click()
      await page.getByRole("alert").waitFor()
      expect(await page.getByLabel("Access token").inputValue()).toBe("")
      await page.getByLabel("Access token").fill(live.token)
      await page.getByRole("button", { name: "Connect", exact: true }).click()
      await page.getByRole("heading", { name: "Open a project", exact: true }).waitFor()
      await page.getByLabel("Project name").fill("Live integration")
      await page.getByLabel("Project directory").fill(live.directory)
      await page.getByRole("button", { name: "Open project", exact: true }).click()
      await page.getByRole("button", { name: "New terminal", exact: true }).first().click()
      await page
        .getByRole("textbox", { name: /^Rename / })
        .first()
        .fill("Live shell")
      await page.keyboard.press("Enter")
      await page.getByRole("region", { name: "Live shell terminal", exact: true }).waitFor()
      await command(page, `echo ${variable("NOVADECK_LIVE_OUTPUT")}`)
      await output(page, "NOVADECK_REAL_PTY_READY")
      await live.save(page, "focus")
      const screen = await page.locator("[data-terminal] .xterm-screen").elementHandle()
      if (!screen) throw new Error("Live shell was not mounted")
      await command(
        page,
        process.platform === "win32" ? "set LIVE_SESSION=KEEP_" : "export LIVE_SESSION=KEEP_",
      )
      const checkView = async (view: string): Promise<void> => {
        await chooseView(page, view)
        expect(
          await screen.evaluate(
            (element) => element === document.querySelector("[data-terminal] .xterm-screen"),
          ),
        ).toBe(true)
        await output(page, "NOVADECK_REAL_PTY_READY")
        await command(page, `echo ${variable("LIVE_SESSION")}AFTER_${view.toUpperCase()}`)
        await output(page, `KEEP_AFTER_${view.toUpperCase()}`)
        await live.save(page, view.toLowerCase())
      }
      await checkView("Grid")
      await checkView("Canvas")
      await checkView("Focus")
      const resumed = live.nextConnection()
      await page.evaluate(() => {
        const sockets = (window as Window & { novadeckLiveSockets?: WebSocket[] })
          .novadeckLiveSockets
        const socket = sockets?.at(-1)
        if (!socket) throw new Error("No authenticated terminal transport")
        socket.close(4000, "Test transport interruption")
      })
      await resumed
      await page
        .locator("[data-terminal] .live-terminal-status")
        .first()
        .waitFor({ state: "detached" })
      await command(page, `echo ${variable("LIVE_SESSION")}AFTER_RECONNECT`)
      await output(page, "KEEP_AFTER_RECONNECT")
      expect(live.sockets.length).toBeGreaterThan(2) // bad token, authenticated, reauthenticated
      await live.save(page, "reconnected")
      const [project] = await live.inspect().projects.list()
      if (!project) throw new Error("Project was not stored by the backend")
      expect(project.name).toBe("Live integration")
      const [session] = await live.inspect().sessions.list({ projectId: project.id })
      if (!session) throw new Error("Session was not stored by the backend")
      const [terminal] = await live.inspect().terminals.list({ sessionId: session.id })
      if (!terminal) throw new Error("Terminal was not created by the backend")
      expect(terminal.status).toBe("running")
      await page.reload()
      await page.getByRole("heading", { name: "Connect to your runtime" }).waitFor()
      expect(await page.getByLabel("Access token").inputValue()).toBe("")
      await page.getByLabel("Access token").fill(live.token)
      await page.getByRole("button", { name: "Connect", exact: true }).click()
      await page.locator("[data-terminal] .xterm-screen").waitFor()
      await output(page, "NOVADECK_REAL_PTY_READY")
      await command(page, `echo ${variable("LIVE_SESSION")}AFTER_DISCOVERY`)
      await output(page, "KEEP_AFTER_DISCOVERY")
      await live.save(page, "discovered")
      expect(live.urls.some((url) => url.includes(live.token))).toBe(false)
      const persisted = await page.evaluate(() =>
        JSON.stringify({
          local: { ...localStorage },
          session: { ...sessionStorage },
          cookie: document.cookie,
        }),
      )
      expect(persisted.includes(live.token)).toBe(false)
      expect(new URL(page.url()).searchParams.has("token")).toBe(false)
      await page
        .locator("[data-terminal]")
        .getByRole("button", { name: /^Close / })
        .click()
      await page.locator("[data-terminal]").waitFor({ state: "detached" })
      expect((await live.inspect().terminals.list({ sessionId: session.id }))[0]?.status).toBe(
        "exited",
      )
      await chooseView(page, "Canvas", false)
      const background = page.getByLabel("Terminal canvas", { exact: true })
      await background.waitFor()
      const bounds = await background.boundingBox()
      if (!bounds) throw new Error("Canvas background is not visible")
      const point = { x: bounds.x + 110, y: bounds.y + 100 }
      const camera = await page
        .locator(".react-flow__viewport")
        .evaluate((element) => (element as HTMLElement).style.transform)
      await page.mouse.click(point.x, point.y, { button: "right" })
      await page.getByRole("menuitem", { name: "Terminal", exact: true }).click()
      await page.locator("[data-terminal] .xterm-screen").waitFor()
      await live.savePlacement({
        point,
        camera,
        viewport: await page
          .locator(".react-flow__viewport")
          .evaluate((element) => (element as HTMLElement).style.transform),
        node: await page.locator(".react-flow__node").evaluate((element) => ({
          transform: (element as HTMLElement).style.transform,
          rect: element.getBoundingClientRect().toJSON(),
        })),
        terminal: await page.locator("[data-terminal]").boundingBox(),
      })
      await page.waitForFunction((requested) => {
        const box = document.querySelector("[data-terminal]")?.getBoundingClientRect()
        return box && Math.abs(box.x - requested.x) < 13 && Math.abs(box.y - requested.y) < 13
      }, point)
      const box = await page.locator("[data-terminal]").boundingBox()
      if (!box) throw new Error("Created Canvas terminal is not visible")
      // Canvas placement snaps to its existing 24px grid.
      expect(Math.abs(box.x - point.x)).toBeLessThan(13)
      expect(Math.abs(box.y - point.y)).toBeLessThan(13)
      expect(
        await page
          .locator(".react-flow__viewport")
          .evaluate((element) => (element as HTMLElement).style.transform),
      ).toBe(camera)
      expect(await page.getByRole("textbox", { name: /^Rename / }).count()).toBe(0)
      await command(page, `echo ${variable("NOVADECK_LIVE_OUTPUT")}`)
      await output(page, "NOVADECK_REAL_PTY_READY")
      await live.save(page, "canvas-created")
      const beforeShortcut = (
        await live.inspect().terminals.list({ sessionId: session.id })
      ).filter((item) => item.status === "running").length
      await page.locator("[data-terminal] .xterm-helper-textarea").focus()
      const mac = await page.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform))
      await page.keyboard.press(mac ? "Meta+t" : "Control+Shift+t")
      await page
        .getByRole("textbox", { name: /^Rename / })
        .first()
        .fill("Shortcut shell")
      await page.keyboard.press("Enter")
      const shortcutTerminal = page.getByRole("region", {
        name: "Shortcut shell terminal",
        exact: true,
      })
      await shortcutTerminal.waitFor()
      expect(
        (await live.inspect().terminals.list({ sessionId: session.id })).filter(
          (item) => item.status === "running",
        ),
      ).toHaveLength(beforeShortcut + 1)
      expect(await page.locator("[data-terminal]").count()).toBe(2)
      await shortcutTerminal
        .getByRole("button", { name: "Close Shortcut shell", exact: true })
        .click()
      await shortcutTerminal.waitFor({ state: "detached" })
      await command(page, "exit")
      await page.getByText("Process exited (0)", { exact: true }).waitFor()
      await page.locator(".footer-running").filter({ hasText: "0 running" }).waitFor()
      await live.save(page, "natural-exit")
      expect(
        (await live.inspect().terminals.list({ sessionId: session.id })).filter(
          (item) => item.status === "running",
        ),
      ).toHaveLength(0)
      await page
        .locator("[data-terminal]")
        .getByRole("button", { name: /^Close / })
        .click()
      await page.locator("[data-terminal]").waitFor({ state: "detached" })
      await page.setViewportSize({ width: 390, height: 844 })
      await page.reload()
      await page.getByRole("heading", { name: "Connect to your runtime" }).waitFor()
      await live.save(page, "mobile-connection")
      expect(
        await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth),
      ).toBe(true)
      expect(live.errors).toEqual([])
    } catch (error) {
      await live.save(page, "failure")
      throw error
    } finally {
      await live.close()
    }
  }, 90_000)
})
