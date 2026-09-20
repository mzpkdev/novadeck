import type { Meta, StoryObj } from "@storybook/react-vite"

import { Link } from "./Primitive"

const meta = {
  title: "Primitives/Link",
  component: Link,
  args: { children: "Open component", href: "#component" },
} satisfies Meta<typeof Link>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const External: Story = {
  args: { children: "Open external resource", external: true, href: "https://example.com" },
}
