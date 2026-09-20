import type { Meta, StoryObj } from "@storybook/react-vite"

import { TreeView } from "../../Navigation"

const meta = { title: "Navigation/Tree View", component: TreeView } satisfies Meta<typeof TreeView>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    label: "Deck outline",
    nodes: [
      { value: "intro", label: "Introduction" },
      {
        value: "chapters",
        label: "Chapters",
        children: [{ value: "one", label: "Chapter one" }],
      },
    ],
  },
}
