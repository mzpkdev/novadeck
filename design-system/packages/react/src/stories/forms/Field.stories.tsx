import type { Meta, StoryObj } from "@storybook/react-vite"

import { Field } from "../../Form"

const meta = { title: "Forms/Field", component: Field.Root } satisfies Meta<typeof Field.Root>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
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
