import type { Meta, StoryObj } from "@storybook/react-vite"

import { Column, Columns } from "../../Layout"

const meta = { title: "Layout/Columns", component: Columns } satisfies Meta<typeof Columns>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Columns rowGap="1rem">
      <Column of={3} span={1}>
        <section
          style={{
            background: "var(--color__accent-subtle)",
            border: "var(--thickness) solid var(--color__border-subtle)",
            borderRadius: "var(--roundness)",
            minHeight: "10rem",
            padding: "var(--spacing__md)",
          }}
        >
          <strong>Sidebar</strong>
          <p>Navigation and filters</p>
        </section>
      </Column>
      <Column of={3} span={2}>
        <section
          style={{
            background: "var(--color__surface)",
            border: "var(--thickness) solid var(--color__border-subtle)",
            borderRadius: "var(--roundness)",
            minHeight: "10rem",
            padding: "var(--spacing__md)",
          }}
        >
          <strong>Content</strong>
          <p>The two-third column expands beside the sidebar.</p>
        </section>
      </Column>
    </Columns>
  ),
}
