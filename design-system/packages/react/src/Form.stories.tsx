import type { Meta, StoryObj } from "@storybook/react-vite"

import { Checkbox, Field, Input, Radio, Select, Slider, Switch, Textarea } from "./Form"

const meta = { title: "Forms" } satisfies Meta
export default meta
type Story = StoryObj

export const FieldRecipe: Story = {
  name: "Field",
  render: () => (
    <Field.Root required>
      <Field.Label>
        Name <Field.RequiredIndicator />
      </Field.Label>
      <Field.Input placeholder="Deck name" />
      <Field.HelperText>Shown in the title bar.</Field.HelperText>
    </Field.Root>
  ),
}
export const InputRecipe: Story = {
  name: "Input",
  render: () => (
    <Input controlProps={{ "aria-label": "Search", placeholder: "Search decks" }} start="⌕" />
  ),
}
export const TextareaRecipe: Story = {
  name: "Textarea",
  render: () => (
    <Textarea
      controlProps={{ "aria-label": "Notes", placeholder: "Notes" }}
      footer="Markdown supported"
    />
  ),
}
export const CheckboxRecipe: Story = {
  name: "Checkbox",
  render: () => <Checkbox label="Include speaker notes" />,
}
export const RadioRecipe: Story = {
  name: "Radio",
  render: () => (
    <Radio
      defaultValue="wide"
      label="Slide format"
      options={[
        { label: "Wide", value: "wide" },
        { label: "Standard", value: "standard" },
      ]}
    />
  ),
}
export const SelectRecipe: Story = {
  name: "Select",
  render: () => (
    <Select
      label="Theme"
      options={[
        { label: "Light", value: "light" },
        { label: "Dark", value: "dark" },
      ]}
    />
  ),
}
export const SliderRecipe: Story = {
  name: "Slider",
  render: () => <Slider label="Zoom" thumbLabels={["Zoom percentage"]} />,
}
export const SwitchRecipe: Story = {
  name: "Switch",
  render: () => <Switch label="Auto-save" />,
}
