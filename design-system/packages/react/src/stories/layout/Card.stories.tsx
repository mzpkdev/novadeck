import type { Meta, StoryObj } from "@storybook/react-vite"

import { Button } from "../../Button"
import { Card } from "../../Layout"

const meta = { title: "Layout/Card", component: Card } satisfies Meta<typeof Card>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div style={{ maxWidth: "26rem" }}>
      <Card {...args} />
    </div>
  ),
  args: {
    children: "A shared planning workspace.",
    footer: <Button variant="text">Open</Button>,
    header: <h2>Project Atlas</h2>,
    meta: "Updated today",
    raised: true,
  },
}
