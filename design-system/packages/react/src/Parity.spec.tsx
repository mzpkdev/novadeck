import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { Checkbox, Field, Input, Radio, Select, Slider, Switch, Textarea } from "./Form"
import { Card, Column, Columns, Divider, Grid, Hero, Inline, Stack } from "./Layout"
import { Menu, NavigationMenu, TreeView } from "./Navigation"
import { Dialog } from "./Overlay"
import { Portal } from "./Portal"
import { ButtonGroup, Link } from "./Primitive"
import { describe, expect, it } from "./test"

describe("recipe parity", () => {
  it("maps the layout and primitive recipes to their CSS classes", () => {
    const { container } = render(
      <>
        <ButtonGroup aria-label="Actions" fluid />
        <Link href="/docs">Docs</Link>
        <Card raised />
        <Columns>
          <Column of={2} span={1} />
        </Columns>
        <Grid minWidth="10rem" />
        <Hero headline="Hello" />
        <Inline />
        <Stack />
        <Divider />
      </>,
    )
    for (const name of [
      "button-group",
      "link",
      "card",
      "columns",
      "column",
      "grid",
      "hero",
      "inline",
      "stack",
      "divider",
    ])
      expect(container.querySelector(`.${name}`)).toBeInTheDocument()
  })

  it("renders each form recipe with its expected structure", () => {
    const { container } = render(
      <>
        <Field.Root>
          <Field.Label>Name</Field.Label>
          <Field.Input />
        </Field.Root>
        <Input controlProps={{ "aria-label": "Search" }} />
        <Textarea controlProps={{ "aria-label": "Notes" }} />
        <Checkbox label="Notes" />
        <Radio label="Format" options={[{ label: "Wide", value: "wide" }]} />
        <Select label="Theme" options={[{ label: "Dark", value: "dark" }]} portal={false} />
        <Slider label="Zoom" />
        <Switch label="Auto-save" />
      </>,
    )
    for (const name of [
      "field",
      "input",
      "textarea",
      "checkbox",
      "radio",
      "select",
      "slider",
      "switch",
    ])
      expect(container.querySelector(`.${name}`)).toBeInTheDocument()
  })

  it("styles the navigation recipes", () => {
    const { container } = render(
      <>
        <Menu.Root>
          <Menu.Trigger>Actions</Menu.Trigger>
          <Menu.Positioner portal={false}>
            <Menu.Content>
              <Menu.Item value="rename">Rename</Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Menu.Root>
        <NavigationMenu.Root>
          <NavigationMenu.List>
            <NavigationMenu.Item value="help">
              <NavigationMenu.Link href="#help">Help</NavigationMenu.Link>
            </NavigationMenu.Item>
          </NavigationMenu.List>
        </NavigationMenu.Root>
      </>,
    )

    expect(container.querySelector(".menu-positioner")).toBeInTheDocument()
    expect(container.querySelector(".navigation-menu")).toBeInTheDocument()
  })

  it("carries the design-system theme into portals", async () => {
    render(
      <div className="novadeck theme-outlined" data-theme="dark">
        <Portal>
          <span data-testid="portal-content">Portalled</span>
        </Portal>
      </div>,
    )

    const portalContent = await screen.findByTestId("portal-content")
    expect(portalContent.parentElement).toHaveClass("novadeck", "theme-outlined")
    expect(portalContent.parentElement).toHaveAttribute("data-theme", "dark")
  })

  it("keeps Ark interactions intact", async () => {
    let checked = false
    render(
      <Checkbox
        label="Notes"
        onCheckedChange={(details) => {
          checked = details.checked === true
        }}
      />,
    )
    fireEvent.click(screen.getByText("Notes").closest("label")!)
    await waitFor(() => expect(checked).toBe(true))
  })

  it("opens the dialog and renders the tree recipe", async () => {
    const { container } = render(
      <>
        <Dialog content="Body" portal={false} title="Settings" />
        <TreeView label="Outline" nodes={[{ label: "Intro", value: "intro" }]} />
      </>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }))
    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeInTheDocument()
    expect(container.querySelector(".tree-view")).toBeInTheDocument()
  })
})
