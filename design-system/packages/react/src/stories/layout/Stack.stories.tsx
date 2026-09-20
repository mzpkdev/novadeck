import type { Meta, StoryObj } from "@storybook/react-vite"

import { Stack } from "../../Layout"

const meta = { title: "Layout/Stack", component: Stack } satisfies Meta<typeof Stack>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Stack gap="1rem" style={{ maxWidth: "24rem" }}>
      <div
        style={{
          background: "var(--color__accent-subtle)",
          borderRadius: "var(--roundness)",
          padding: "var(--spacing__md)",
        }}
      >
        <strong>First block</strong>
      </div>
      <div
        style={{
          background: "var(--color__surface)",
          border: "var(--thickness) solid var(--color__border-subtle)",
          borderRadius: "var(--roundness)",
          padding: "var(--spacing__md)",
        }}
      >
        <strong>Second block</strong>
      </div>
    </Stack>
  ),
}
