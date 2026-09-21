import type { Meta, StoryObj } from "@storybook/react-vite"

import { Editable } from "./Editable"

const EditableExample = () => (
  <Editable.Root activationMode="dblclick" defaultValue="Terminal 1">
    <Editable.Label>Terminal name</Editable.Label>
    <Editable.Area>
      <Editable.Preview />
      <Editable.Input />
    </Editable.Area>
  </Editable.Root>
)

const meta = {
  title: "Forms/Editable",
  component: EditableExample,
} satisfies Meta<typeof EditableExample>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
