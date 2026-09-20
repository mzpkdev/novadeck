import type { Meta, StoryObj } from "@storybook/react-vite"

import { Button } from "./Button"
import { ButtonGroup } from "./Primitive"

const meta = {
  title: "Primitives/Button Group",
  component: ButtonGroup,
} satisfies Meta<typeof ButtonGroup>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { "aria-label": "Deck actions" },
  render: (args) => (
    <ButtonGroup {...args}>
      <Button>Cancel</Button>
      <Button variant="filled">Save</Button>
    </ButtonGroup>
  ),
}
