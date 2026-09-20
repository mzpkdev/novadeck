import type { Meta, StoryObj } from "@storybook/react-vite"

import { Button } from "./Button"
import { Card, Column, Columns, Container, Divider, Grid, Hero, Inline, Stack } from "./Layout"

const meta = { title: "Layout" } satisfies Meta
export default meta
type Story = StoryObj

export const CardRecipe: Story = {
  name: "Card",
  render: () => (
    <Card
      header={<h2>Project Atlas</h2>}
      meta="Updated today"
      footer={<Button variant="text">Open</Button>}
      raised
    >
      A shared planning workspace.
    </Card>
  ),
}
export const ColumnsRecipe: Story = {
  name: "Columns",
  render: () => (
    <Columns rowGap="1rem">
      <Column of={3} span={1}>
        Sidebar
      </Column>
      <Column of={3} span={2}>
        Content
      </Column>
    </Columns>
  ),
}
export const ContainerRecipe: Story = {
  name: "Container",
  render: () => (
    <Container maxWidth="48rem" textAlign="center">
      Contained content
    </Container>
  ),
}
export const DividerRecipe: Story = { name: "Divider", render: () => <Divider>Details</Divider> }
export const GridRecipe: Story = {
  name: "Grid",
  render: () => (
    <Grid minWidth="12rem">
      {[1, 2, 3].map((item) => (
        <Card header={`Card ${item}`} key={item} />
      ))}
    </Grid>
  ),
}
export const HeroRecipe: Story = {
  name: "Hero",
  render: () => (
    <Hero headline="Build your next deck" subheading="Fast, focused, and local.">
      <Button variant="filled">Get started</Button>
    </Hero>
  ),
}
export const InlineRecipe: Story = {
  name: "Inline",
  render: () => (
    <Inline gap="1rem">
      <Button>Cancel</Button>
      <Button variant="filled">Save</Button>
    </Inline>
  ),
}
export const StackRecipe: Story = {
  name: "Stack",
  render: () => (
    <Stack gap="1rem">
      <strong>First</strong>
      <span>Second</span>
    </Stack>
  ),
}
