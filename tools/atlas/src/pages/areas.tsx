import { Link, useParams } from "react-router"

import { areaById, atlas, groupBy, nodeTitle } from "../atlas-data.ts"
import { AnchorList, DocLink } from "../components/anchor.tsx"
import { Badge, Empty, Mono, Page, Section, Table, Td, Th } from "../components/ui.tsx"
import { areaPath, nodePath, procedurePath, tablePath, toolPath } from "../links.ts"

export const AreasPage = () => {
  const groups = groupBy(atlas.areas, (a) => a.node)
  return (
    <Page
      title="Areas"
      subtitle="Slices of the code with one job, grouped by the runtime node they run in."
    >
      {groups.length === 0 ? <Empty>No areas extracted yet.</Empty> : null}
      {groups.map(([node, areas]) => (
        <Section key={node} title={nodeTitle(node)} count={areas.length}>
          <Table>
            <thead>
              <tr>
                <Th>Area</Th>
                <Th>Purpose</Th>
                <Th className="text-right">Files</Th>
                <Th className="text-right">Lines</Th>
                <Th className="text-right">Tests</Th>
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a.id}>
                  <Td className="whitespace-nowrap">
                    <Link to={areaPath(a.id)}>{a.title}</Link>
                  </Td>
                  <Td className="text-muted">{a.purpose}</Td>
                  <Td className="text-right font-mono">{a.files}</Td>
                  <Td className="text-right font-mono">{a.lines}</Td>
                  <Td className="text-right font-mono">{a.tests}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      ))}
    </Page>
  )
}

export const AreaPage = () => {
  const { id = "" } = useParams()
  const area = areaById.get(id)
  if (!area) {
    return (
      <Page title="Unknown area">
        <Link to="/areas">Back to areas</Link>
      </Page>
    )
  }
  return (
    <Page title={area.title} subtitle={area.purpose}>
      <Section title="Overview">
        <dl className="grid grid-cols-[7rem_1fr] gap-y-1">
          <dt className="text-muted">Id</dt>
          <dd>
            <Mono>{area.id}</Mono>
          </dd>
          <dt className="text-muted">Runs in</dt>
          <dd>
            <Link to={nodePath(area.node)}>{nodeTitle(area.node)}</Link>
          </dd>
          <dt className="text-muted">Size</dt>
          <dd>
            <Mono>
              {area.files} files, {area.lines} lines, {area.tests} tests
            </Mono>
          </dd>
          <dt className="text-muted">Globs</dt>
          <dd className="flex flex-wrap gap-1">
            {area.globs.map((g) => (
              <Badge key={g}>{g}</Badge>
            ))}
          </dd>
        </dl>
      </Section>
      <Section title="Entry points" count={area.entries.length}>
        {area.entries.length ? <AnchorList anchors={area.entries} /> : <Empty>None.</Empty>}
      </Section>
      <Section title="Docs" count={area.docs.length}>
        {area.docs.length ? (
          <ul>
            {area.docs.map((d) => (
              <li key={d}>
                <DocLink file={d} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>None.</Empty>
        )}
      </Section>
      <Section title="Procedures" count={area.procedures.length}>
        <Owned ids={area.procedures} to={procedurePath} />
      </Section>
      <Section title="Tables" count={area.tables.length}>
        <Owned ids={area.tables} to={tablePath} />
      </Section>
      <Section title="Agent tools" count={area.tools.length}>
        <Owned ids={area.tools} to={toolPath} />
      </Section>
    </Page>
  )
}

const Owned = ({ ids, to }: { ids: string[]; to: (id: string) => string }) =>
  ids.length ? (
    <ul className="flex flex-wrap gap-x-4 gap-y-0.5">
      {ids.map((id) => (
        <li key={id}>
          <Link to={to(id)} className="font-mono text-[12px]">
            {id}
          </Link>
        </li>
      ))}
    </ul>
  ) : (
    <Empty>None.</Empty>
  )
