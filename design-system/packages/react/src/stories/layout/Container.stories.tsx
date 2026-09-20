import type { Meta, StoryObj } from "@storybook/react-vite"

import { Container } from "../../Layout"

const meta = { title: "Layout/Container", component: Container } satisfies Meta<typeof Container>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div
      style={{
        background: "var(--color__accent-subtle)",
        minHeight: "12rem",
        paddingBlock: "var(--spacing__xl)",
      }}
    >
      <Container {...args}>
        <div
          style={{
            background: "var(--color__surface)",
            border: "var(--thickness) solid var(--color__border-subtle)",
            borderRadius: "var(--roundness)",
            padding: "var(--spacing__xl)",
          }}
        >
          {args.children}
        </div>
      </Container>
    </div>
  ),
  args: { children: "Content constrained to 48rem", maxWidth: "48rem", textAlign: "center" },
}
