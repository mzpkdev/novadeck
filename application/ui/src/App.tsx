import { Button, Card, Textarea } from "@novadeck/react"
import {
  ArrowUp,
  Bot,
  ChevronDown,
  Command,
  FileText,
  MoreHorizontal,
  Plus,
  Settings,
  Sparkles,
  Terminal,
  User,
} from "@novadeck/react/icons"
import { useEffect, useState } from "react"

import { readStatus, type ServiceStatus } from "./services/status"

const conversations = [
  "Launch narrative",
  "Q3 review structure",
  "Research synthesis",
  "Rewrite opening slide",
] as const

const statusStyles = {
  connecting: "bg-text-500",
  ready: "bg-accent",
  unavailable: "bg-danger",
} as const satisfies Record<ServiceStatus["status"] | "connecting" | "unavailable", string>

export const App = (): React.JSX.Element => {
  const [status, setStatus] = useState<ServiceStatus["status"] | "connecting" | "unavailable">(
    "connecting",
  )

  useEffect(() => {
    let active = true

    void readStatus().then(
      (result) => {
        if (active) setStatus(result.status)
      },
      () => {
        if (active) setStatus("unavailable")
      },
    )

    return () => {
      active = false
    }
  }, [])

  return (
    <main
      className="novadeck min-h-screen bg-background font-sans text-text-900 antialiased"
      data-theme="light"
    >
      <div className="min-h-screen [display:grid] lg:h-screen lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="flex items-center gap-ds-md border-b border-border-subtle bg-surface px-ds-md py-ds-sm lg:h-screen lg:flex-col lg:items-stretch lg:border-r lg:border-b-0 lg:px-ds-md lg:py-ds-lg">
          <div className="flex min-w-0 items-center gap-ds-sm px-ds-xs">
            <span className="size-8 shrink-0 place-items-center rounded-sm bg-text-900 text-background shadow-level-1 [display:grid]">
              <Command aria-hidden="true" className="size-4" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">NovaDeck</p>
              <p className="truncate font-mono text-[0.625rem] text-text-500">assistant / local</p>
            </div>
          </div>

          <Button
            className="ml-auto shrink-0 text-xs lg:mt-ds-lg lg:ml-0"
            start={<Plus aria-hidden="true" />}
            variant="filled"
          >
            New chat
          </Button>

          <nav
            aria-label="Conversation history"
            className="mt-ds-lg hidden min-h-0 flex-1 lg:block"
          >
            <p className="px-ds-sm font-mono text-[0.625rem] font-semibold tracking-[0.14em] text-text-500 uppercase">
              Recent
            </p>
            <div className="mt-ds-xs space-y-ds-2xs">
              {conversations.map((conversation, index) => (
                <Button
                  aria-current={index === 0 ? "page" : undefined}
                  className="justify-start overflow-hidden text-left text-xs"
                  fluid
                  href={`#conversation-${index + 1}`}
                  key={conversation}
                  variant={index === 0 ? "tonal" : "text"}
                >
                  <span className="truncate">{conversation}</span>
                </Button>
              ))}
            </div>
          </nav>

          <div className="mt-auto hidden space-y-ds-xs lg:block">
            <div
              aria-label="Runtime status"
              className="flex items-center justify-between border-y border-border-subtle px-ds-sm py-ds-md font-mono text-[0.625rem] text-text-500"
              role="complementary"
            >
              <span className="flex items-center gap-ds-xs">
                <span className={`size-1.5 rounded-full ${statusStyles[status]}`} />
                Runtime {status}
              </span>
              <span>v0.0</span>
            </div>
            <Button
              className="justify-start text-xs"
              fluid
              start={<Settings aria-hidden="true" />}
              variant="text"
            >
              Settings
            </Button>
          </div>
        </aside>

        <section className="flex h-[calc(100svh-4rem)] min-w-0 flex-col lg:h-screen">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle bg-background/90 px-ds-md backdrop-blur md:px-ds-xl">
            <Button
              className="-ml-ds-sm text-sm"
              end={<ChevronDown aria-hidden="true" />}
              variant="text"
            >
              NovaDeck Assistant
            </Button>
            <div className="flex items-center gap-ds-xs">
              <span className="hidden items-center gap-ds-xs font-mono text-[0.625rem] text-text-500 sm:flex">
                <span className={`size-1.5 rounded-full ${statusStyles[status]}`} />
                local runtime
              </span>
              <Button aria-label="Conversation options" iconOnly variant="text">
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl flex-col px-ds-lg py-ds-2xl md:px-ds-xl">
              <section
                className="mb-10 border-b border-border-subtle pb-ds-xl"
                aria-labelledby="assistant-heading"
              >
                <div className="mb-ds-md flex items-center gap-ds-xs font-mono text-[0.625rem] font-semibold tracking-[0.14em] text-accent uppercase">
                  <Terminal aria-hidden="true" className="size-3.5" />
                  Session ready
                </div>
                <h1
                  className="text-2xl font-semibold tracking-tight md:text-3xl"
                  id="assistant-heading"
                >
                  NovaDeck Assistant
                </h1>
                <p className="mt-ds-sm max-w-xl text-sm leading-6 text-text-500">
                  Build a presentation by describing the story you want to tell. I’ll shape the
                  structure, write the slides, and keep the narrative focused.
                </p>
              </section>

              <div className="space-y-8" aria-label="Conversation">
                <article className="flex gap-ds-md" aria-label="You">
                  <span className="size-7 shrink-0 place-items-center rounded-sm border border-border bg-surface font-mono text-text-500 [display:grid]">
                    <User aria-hidden="true" className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1 pt-ds-2xs">
                    <p className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-text-500 uppercase">
                      You
                    </p>
                    <p className="mt-ds-xs text-sm leading-6">
                      Create a concise product launch deck for a calm, privacy-first AI workspace.
                      Make it feel confident without sounding corporate.
                    </p>
                  </div>
                </article>

                <article className="flex gap-ds-md" aria-label="NovaDeck Assistant">
                  <span className="size-7 shrink-0 place-items-center rounded-sm bg-text-900 text-background [display:grid]">
                    <Bot aria-hidden="true" className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1 pt-ds-2xs">
                    <div className="flex items-center gap-ds-xs">
                      <p className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-text-500 uppercase">
                        Assistant
                      </p>
                      <Sparkles aria-hidden="true" className="size-3 text-accent" />
                    </div>
                    <p className="mt-ds-xs text-sm leading-6">
                      I’d frame it as a quiet alternative to noisy AI tools: one clear idea per
                      slide, grounded in trust and control. Here’s a six-slide narrative.
                    </p>

                    <Card
                      className="mt-ds-lg"
                      fluid
                      renderContent={
                        <div className="font-mono text-xs">
                          <div className="flex items-center justify-between border-b border-border-subtle bg-surface-subtle px-ds-md py-ds-sm">
                            <span className="flex items-center gap-ds-xs text-text-500">
                              <FileText aria-hidden="true" className="size-3.5" />
                              launch-outline.deck
                            </span>
                            <span className="text-[0.625rem] text-text-500">6 slides</span>
                          </div>
                          <ol className="space-y-ds-sm p-ds-md">
                            {[
                              ["01", "A calmer way to work with AI"],
                              ["02", "The cost of noisy, fragmented tools"],
                              ["03", "One private workspace for real thinking"],
                              ["04", "Control stays with your team"],
                              ["05", "From first thought to finished work"],
                              ["06", "Do your best work. Keep it yours."],
                            ].map(([number, title]) => (
                              <li className="flex gap-ds-md" key={number}>
                                <span className="text-accent">{number}</span>
                                <span className="text-text-700">{title}</span>
                              </li>
                            ))}
                          </ol>
                          <div className="flex flex-wrap items-center gap-ds-xs border-t border-border-subtle px-ds-md py-ds-sm">
                            <Button className="text-xs" variant="filled">
                              Build deck
                            </Button>
                            <Button className="text-xs" variant="text">
                              Refine outline
                            </Button>
                          </div>
                        </div>
                      }
                    />
                  </div>
                </article>
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-border-subtle bg-background px-ds-lg py-ds-md md:px-ds-xl">
            <form className="mx-auto max-w-3xl" onSubmit={(event) => event.preventDefault()}>
              <Textarea
                aria-label="Message composer"
                className="bg-surface shadow-level-2"
                controlProps={{
                  "aria-label": "Message NovaDeck Assistant",
                  className: "resize-none",
                  placeholder: "Describe the deck you want to make…",
                  rows: 2,
                }}
                footer={
                  <div className="flex items-center justify-between gap-ds-md">
                    <span className="font-mono text-[0.625rem] text-text-500">
                      <span className="text-accent">~/novadeck</span> · local context
                    </span>
                    <Button aria-label="Send message" iconOnly type="submit" variant="filled">
                      <ArrowUp aria-hidden="true" />
                    </Button>
                  </div>
                }
              />
              <p className="mt-ds-xs text-center font-mono text-[0.625rem] text-text-500">
                NovaDeck can make mistakes. Review generated slides before presenting.
              </p>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}
