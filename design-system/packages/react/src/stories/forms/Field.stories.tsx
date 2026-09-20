import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"

import { Field, Input } from "../../Form"

const meta = { title: "Forms/Field", component: Field.Root } satisfies Meta<typeof Field.Root>
export default meta
type Story = StoryObj<typeof meta>

const render = (control: ReactNode) => (
  <Field.Root required>
    <Field.Label>
      Name <Field.RequiredIndicator />
    </Field.Label>
    {control}
    <Field.HelperText>Shown in the title bar.</Field.HelperText>
  </Field.Root>
)

export const Outlined: Story = {
  render: () => render(<Field.Input placeholder="Deck name" />),
}

export const Elevated: Story = {
  render: () => render(<Input controlProps={{ placeholder: "Deck name" }} variant="elevated" />),
}
