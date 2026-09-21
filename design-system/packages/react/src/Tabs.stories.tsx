import type { Meta, StoryObj } from "@storybook/react-vite"

import { Tabs } from "./Tabs"

const TabsExample = () => (
  <Tabs.Root defaultValue="first">
    <Tabs.List aria-label="Example tabs">
      <Tabs.Trigger value="first">First</Tabs.Trigger>
      <Tabs.Trigger value="second">Second</Tabs.Trigger>
      <Tabs.Indicator />
    </Tabs.List>
    <Tabs.Content value="first">First panel</Tabs.Content>
    <Tabs.Content value="second">Second panel</Tabs.Content>
  </Tabs.Root>
)

const meta = { title: "Navigation/Tabs", component: TabsExample } satisfies Meta<typeof TabsExample>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
