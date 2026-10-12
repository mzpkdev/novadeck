import type { ReactNode } from "react"
import { Link } from "react-router"

import { atlas, groupBy } from "../atlas-data.ts"
import type { Table as TableData } from "../atlas.ts"
import { AnchorLink, AnchorList } from "../components/anchor.tsx"
import { Card, Empty, Mono, Page, Section, Table, Td, Th } from "../components/ui.tsx"
import { useFocus } from "../components/use-focus.ts"
import { areaPath, settingId } from "../links.ts"

const TableCard = ({ table: t }: { table: TableData }) => {
  const { ref, focused } = useFocus(`table:${t.name}`)
  return (
    <div ref={ref} id={`table:${t.name}`} data-focused={focused}>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-1.5">
          <Mono className="font-medium">{t.name}</Mono>
          {t.area ? (
            <Link to={areaPath(t.area)} className="text-[12px]">
              {t.area}
            </Link>
          ) : null}
          <span className="ml-auto text-[12px]">
            <AnchorLink anchor={t.anchor} />
          </span>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Column</Th>
              <Th>Type</Th>
              <Th>Constraints</Th>
            </tr>
          </thead>
          <tbody>
            {t.columns.map((c) => (
              <tr key={c.name}>
                <Td>
                  <Mono>{c.name}</Mono>
                </Td>
                <Td>
                  <Mono className="text-muted">{c.type}</Mono>
                </Td>
                <Td>
                  <Mono className="text-muted">{c.constraints}</Mono>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="space-y-1 px-3 py-2 text-[12px] text-muted">
          <div>
            readers{" "}
            {t.readers.length ? (
              <AnchorList anchors={t.readers} />
            ) : (
              <span className="italic">none</span>
            )}
          </div>
          <div>
            writers{" "}
            {t.writers.length ? (
              <AnchorList anchors={t.writers} />
            ) : (
              <span className="italic">none</span>
            )}
          </div>
          <details>
            <summary className="cursor-pointer hover:text-fg">sql</summary>
            <pre className="mt-1 overflow-auto font-mono text-[12px] leading-5 text-fg">
              {t.sql}
            </pre>
          </details>
        </div>
      </Card>
    </div>
  )
}

const SettingRow = ({
  group,
  name,
  type,
  children,
}: {
  group: string
  name: string
  type: string
  children: ReactNode
}) => {
  const id = settingId(group, name)
  const { ref, focused } = useFocus<HTMLTableRowElement>(id)
  return (
    <tr ref={ref} id={id} data-focused={focused}>
      <Td>
        <Mono>{name}</Mono>
      </Td>
      <Td>
        <Mono className="text-muted">{type}</Mono>
      </Td>
      <Td>{children}</Td>
    </tr>
  )
}

export const DataPage = () => (
  <Page
    title="Data"
    subtitle="What the runner stores in SQLite, the settings it reads, and what the UI keeps in the browser."
  >
    <Section title="Tables" count={atlas.data.tables.length}>
      {atlas.data.tables.length === 0 ? <Empty>No tables extracted yet.</Empty> : null}
      <div className="space-y-4">
        {atlas.data.tables.map((t) => (
          <TableCard key={t.name} table={t} />
        ))}
      </div>
    </Section>
    <Section title="Settings" count={atlas.data.settings.length}>
      {atlas.data.settings.length === 0 ? <Empty>No settings extracted yet.</Empty> : null}
      {groupBy(atlas.data.settings, (s) => s.group).map(([group, settings]) => (
        <div key={group} className="mb-4">
          <h3 className="mb-1 font-mono text-[12px] font-medium">{group}</h3>
          <Table>
            <thead>
              <tr>
                <Th>Key</Th>
                <Th>Type</Th>
                <Th>Defined</Th>
              </tr>
            </thead>
            <tbody>
              {settings.map((s) => (
                <SettingRow key={s.key} group={group} name={s.key} type={s.type}>
                  <AnchorLink anchor={s.anchor} />
                </SettingRow>
              ))}
            </tbody>
          </Table>
        </div>
      ))}
    </Section>
    <Section title="UI local storage" count={atlas.data.local.length}>
      {atlas.data.local.length === 0 ? (
        <Empty>None.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Key</Th>
              <Th>Summary</Th>
              <Th>Defined</Th>
            </tr>
          </thead>
          <tbody>
            {atlas.data.local.map((k) => (
              <tr key={k.key}>
                <Td>
                  <Mono>{k.key}</Mono>
                </Td>
                <Td className="text-muted">{k.summary ?? ""}</Td>
                <Td>
                  <AnchorLink anchor={k.anchor} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Section>
  </Page>
)
