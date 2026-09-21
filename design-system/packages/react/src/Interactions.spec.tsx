import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { Editable } from "./Editable"
import { Radio, Select, Slider, Switch } from "./Form"
import { Menu, TreeView } from "./Navigation"
import { Dialog } from "./Overlay"
import { Tabs } from "./Tabs"
import { describe, expect, it } from "./test"

describe("Ark UI wrapper interactions", () => {
  it("moves through vertical tabs with the keyboard", async () => {
    render(
      <Tabs.Root defaultValue="one" orientation="vertical">
        <Tabs.List aria-label="Terminals">
          <Tabs.Trigger value="one">Terminal 1</Tabs.Trigger>
          <Tabs.Trigger value="two">Terminal 2</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="one">First terminal</Tabs.Content>
        <Tabs.Content value="two">Second terminal</Tabs.Content>
      </Tabs.Root>,
    )

    const first = screen.getByRole("tab", { name: "Terminal 1" })
    first.focus()
    fireEvent.keyDown(first, { key: "ArrowDown" })

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Terminal 2" })).toHaveFocus()
    })
    fireEvent.click(screen.getByRole("tab", { name: "Terminal 2" }))
    await waitFor(() => expect(screen.getByText("Second terminal")).toBeVisible())
  })

  it("commits and cancels editable values from the keyboard", async () => {
    let value = "Terminal 1"
    render(
      <Editable.Root
        activationMode="dblclick"
        defaultValue={value}
        defaultEdit
        onValueCommit={(details) => {
          value = details.value
        }}
      >
        <Editable.Area>
          <Editable.Preview />
          <Editable.Input aria-label="Terminal name" />
        </Editable.Area>
      </Editable.Root>,
    )

    const input = screen.getByRole("textbox", { name: "Terminal name" })
    await act(async () => {
      fireEvent.input(input, { target: { value: "Build" } })
    })
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => expect(screen.getByText("Build")).toBeVisible())
    expect(value).toBe("Build")

    fireEvent.doubleClick(screen.getByText("Build"))
    const reopened = await screen.findByRole("textbox", { name: "Terminal name" })
    fireEvent.input(reopened, { target: { value: "Discarded" } })
    fireEvent.keyDown(reopened, { key: "Escape" })
    await waitFor(() => expect(screen.getByText("Build")).toBeVisible())
  })

  it("preserves radio and switch state changes", async () => {
    let radioValue: string | null = null
    let switchChecked = false
    render(
      <>
        <Radio
          label="Format"
          onValueChange={(details) => {
            radioValue = details.value
          }}
          options={[{ label: "Wide", value: "wide" }]}
        />
        <Switch
          label="Auto-save"
          onCheckedChange={(details) => {
            switchChecked = details.checked
          }}
        />
      </>,
    )

    fireEvent.click(screen.getByText("Wide"))
    fireEvent.click(screen.getByText("Auto-save"))

    await waitFor(() => {
      expect(radioValue).toBe("wide")
      expect(switchChecked).toBe(true)
    })
  })

  it("opens and selects an option with the keyboard", async () => {
    let selected: string[] = []
    render(
      <Select
        label="Theme"
        onValueChange={(details) => {
          selected = details.value
        }}
        options={[
          { label: "Light", value: "light" },
          { label: "Dark", value: "dark" },
        ]}
        portal={false}
      />,
    )

    const trigger = screen.getByRole("combobox", { name: "Theme" })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: "ArrowDown" })
    const listbox = await screen.findByRole("listbox")
    fireEvent.keyDown(listbox, { key: "End" })
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Dark" })).toHaveAttribute("data-highlighted"),
    )
    fireEvent.keyDown(listbox, { key: "Enter" })

    await waitFor(() => expect(selected).toEqual(["dark"]))
  })

  it("keeps slider keyboard changes wired to the public callback", async () => {
    let value = [50]
    render(
      <Slider
        label="Zoom"
        onValueChange={(details) => {
          value = details.value
        }}
      />,
    )

    const thumb = screen.getByRole("slider", { hidden: true })
    thumb.focus()
    fireEvent.keyDown(thumb, { key: "ArrowRight" })

    await waitFor(() => expect(value).toEqual([51]))
    expect(thumb).toHaveFocus()
  })

  it("opens a menu and focuses its first item from the keyboard", async () => {
    render(
      <Menu.Root>
        <Menu.Trigger>Actions</Menu.Trigger>
        <Menu.Positioner portal={false}>
          <Menu.Content>
            <Menu.Item value="rename">Rename</Menu.Item>
            <Menu.Item value="duplicate">Duplicate</Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Menu.Root>,
    )

    const trigger = screen.getByRole("button", { name: "Actions" })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: "ArrowDown" })

    const menu = await screen.findByRole("menu")
    const firstItem = screen.getByRole("menuitem", { name: "Rename" })
    await waitFor(() => {
      expect(menu).toHaveFocus()
      expect(menu).toHaveAttribute("aria-activedescendant", firstItem.id)
    })
  })

  it("expands tree branches and closes dialogs with Escape", async () => {
    render(
      <>
        <TreeView
          defaultExpandedValue={[]}
          label="Outline"
          nodes={[
            {
              children: [{ label: "Chapter one", value: "one" }],
              label: "Chapters",
              value: "chapters",
            },
          ]}
        />
        <Dialog content="Body" portal={false} title="Settings" />
      </>,
    )

    const branch = screen.getByText("Chapters").closest('[data-part="branch-control"]')!
    expect(screen.queryByText("Chapter one")).not.toBeVisible()
    fireEvent.click(branch)
    await waitFor(() => expect(screen.getByText("Chapter one")).toBeVisible())

    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }))
    await screen.findByRole("dialog", { name: "Settings" })
    fireEvent.keyDown(document, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull())
  })

  it("keeps disabled linked tree nodes as semantic tree items", () => {
    render(
      <TreeView
        label="Outline"
        nodes={[{ disabled: true, href: "/locked", label: "Locked", value: "locked" }]}
      />,
    )

    const item = screen.getByRole("treeitem", { name: "Locked" })
    expect(item).toHaveClass("item")
    expect(item).toHaveAttribute("aria-disabled", "true")
    expect(item).not.toHaveAttribute("href")
    expect(item.querySelector("a")).toBeNull()
  })
})
