import type { Meta, StoryObj } from "@storybook/react-vite"

import { Card, Grid } from "../../Layout"

const meta = { title: "Layout/Grid", component: Grid } satisfies Meta<typeof Grid>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Grid minWidth="12rem">
      {[1, 2, 3].map((item) => (
        <Card header={`Card ${item}`} key={item} />
      ))}
    </Grid>
  ),
}
