import { Link } from "react-router"

import { areaById, atlas, groupBy } from "../atlas-data.ts"
import type { McpTool } from "../atlas.ts"
import { AnchorLink } from "../components/anchor.tsx"
import { SchemaView } from "../components/schema.tsx"
import { Badge, Card, Empty, Mono, Page, Section, Table, Td, Th } from "../components/ui.tsx"
import { useFocus } from "../components/use-focus.ts"
import { areaPath } from "../links.ts"

const ToolCard = ({ tool }: { tool: McpTool }) => {
  const { ref, focused } = useFocus(`tool:${tool.name}`)
  const owner = atlas.areas.find((a) => a.tools.includes(tool.name))
  return (
    <div ref={ref} id={`tool:${tool.name}`} data-focused={focused}>
      <Card className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <Mono className="font-medium">{tool.name}</Mono>
          {owner ? (
            <Link to={areaPath(owner.id)} className="text-[12px]">
              {areaById.get(owner.id)?.title}
            </Link>
          ) : null}
          <span className="ml-auto flex gap-4 text-[12px] text-muted">
            <span>
              def <AnchorLink anchor={tool.anchor} />
            </span>
            {tool.handler ? (
              <span>
                handler <AnchorLink anchor={tool.handler} />
              </span>
            ) : null}
          </span>
        </div>
        <p className="mt-1 text-muted">{tool.description}</p>
        <details className="mt-1">
          <summary className="cursor-pointer text-[12px] text-muted hover:text-fg">
            input schema
          </summary>
          <div className="mt-1">
            <SchemaView schema={tool.input} />
          </div>
        </details>
      </Card>
    </div>
  )
}

export const AgentsPage = () => {
  const { tools, hooks, contract, harnesses } = atlas.agents
  return (
    <Page title="Agents" subtitle="Novadeck as an agent inside a terminal sees it.">
      <Section title="MCP tools" count={tools.length}>
        {tools.length === 0 ? <Empty>No tools extracted yet.</Empty> : null}
        <div className="space-y-3">
          {tools.map((t) => (
            <ToolCard key={t.name} tool={t} />
          ))}
        </div>
      </Section>
      <Section title="Hooks" count={hooks.length}>
        {hooks.length === 0 ? <Empty>None.</Empty> : null}
        {groupBy(hooks, (h) => h.harness).map(([harness, items]) => (
          <div key={harness} className="mb-4">
            <h3 className="mb-1 font-mono text-[12px] font-medium">{harness}</h3>
            <Table>
              <thead>
                <tr>
                  <Th>Event</Th>
                  <Th>Summary</Th>
                  <Th>Defined</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((h) => (
                  <tr key={h.event}>
                    <Td>
                      <Mono>{h.event}</Mono>
                    </Td>
                    <Td className="text-muted">{h.summary}</Td>
                    <Td>
                      <AnchorLink anchor={h.anchor} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ))}
      </Section>
      <Section title="Harness matrix" count={harnesses.length}>
        {contract.length === 0 || harnesses.length === 0 ? (
          <Empty>No harness contract extracted yet.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Contract member</Th>
                {harnesses.map((h) => (
                  <Th key={h.id} className="text-center">
                    <span title={h.package}>{h.title}</span>
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contract.map((m) => (
                <tr key={m.name}>
                  <Td>
                    <span title={m.summary} className="inline-flex items-center gap-2">
                      <Mono>{m.name}</Mono>
                      {m.optional ? <Badge>optional</Badge> : null}
                    </span>
                  </Td>
                  {harnesses.map((h) => (
                    <Td key={h.id} className="text-center font-mono">
                      {h.implements.includes(m.name) ? "✓" : <span className="text-muted">—</span>}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </Page>
  )
}
