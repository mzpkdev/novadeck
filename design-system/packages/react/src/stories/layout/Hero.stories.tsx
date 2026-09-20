import type { Meta, StoryObj } from "@storybook/react-vite"

import { Button } from "../../Button"
import { Hero } from "../../Layout"

const meta = { title: "Layout/Hero", component: Hero } satisfies Meta<typeof Hero>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    background: (
      <div
        style={{
          background: "linear-gradient(135deg, var(--color__accent-subtle), var(--color__surface))",
        }}
      />
    ),
    children: <Button variant="filled">Get started</Button>,
    headline: "Build your next deck",
    subheading: "Fast, focused, and local.",
  },
}
