import type { Meta, StoryObj } from "@storybook/react-vite"

import { Button } from "../../Button"
import { Inline } from "../../Layout"

const meta = { title: "Layout/Inline", component: Inline } satisfies Meta<typeof Inline>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <div
      style={{
        background: "var(--color__accent-subtle)",
        borderRadius: "var(--roundness)",
        padding: "var(--spacing__md)",
      }}
    >
      <Inline gap="1rem">
        <Button>Cancel</Button>
        <Button variant="filled">Save</Button>
      </Inline>
    </div>
  ),
}
