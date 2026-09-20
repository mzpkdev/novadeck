import type { Meta, StoryObj } from "@storybook/react-vite"

import { Button } from "./Button"
import { Card, Column, Columns, Container, Divider, Grid, Hero, Inline, Stack } from "./Layout"

const meta = { title: "Layout/Recipes" } satisfies Meta
export default meta
type Story = StoryObj

export const CardRecipe: Story = {
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
  render: () => (
    <Container maxWidth="48rem" textAlign="center">
      Contained content
    </Container>
  ),
}
export const DividerRecipe: Story = { render: () => <Divider>Details</Divider> }
export const GridRecipe: Story = {
  render: () => (
    <Grid minWidth="12rem">
      {[1, 2, 3].map((item) => (
        <Card header={`Card ${item}`} key={item} />
      ))}
    </Grid>
  ),
}
export const HeroRecipe: Story = {
  render: () => (
    <Hero headline="Build your next deck" subheading="Fast, focused, and local.">
      <Button variant="filled">Get started</Button>
    </Hero>
  ),
}
export const InlineRecipe: Story = {
  render: () => (
    <Inline gap="1rem">
      <Button>Cancel</Button>
      <Button variant="filled">Save</Button>
    </Inline>
  ),
}
export const StackRecipe: Story = {
  render: () => (
    <Stack gap="1rem">
      <strong>First</strong>
      <span>Second</span>
    </Stack>
  ),
}
