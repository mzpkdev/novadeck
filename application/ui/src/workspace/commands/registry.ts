import type { CommandDefinition, CommandId, Shortcut } from "./definitions"

export type CommandArgs = {
  terminalId?: string
  fromKeyboard?: boolean
  sourceEvent?: KeyboardEvent
}
export type CommandHandler = (args: CommandArgs) => unknown
export type BindingOverrides = Partial<Record<CommandId, Shortcut[]>>
export type CommandContext = {
  dialog: boolean
  editor: boolean
  workspace: boolean
  overlay: boolean
}

const matches = (event: KeyboardEvent, binding: Shortcut): boolean =>
  (event.key.toLowerCase() === binding.key.toLowerCase() ||
    (binding.code !== undefined && event.code === binding.code)) &&
  event.ctrlKey === binding.ctrl &&
  event.metaKey === binding.meta &&
  event.shiftKey === binding.shift &&
  !event.altKey

// Definitions are shared by keyboard input, controls and shortcut help. The
// environment supplies current availability/execution; the registry owns policy.
export const createCommandRegistry = ({
  definitions,
  handlers,
  available,
  context,
  onError,
  overrides = {},
}: {
  definitions: CommandDefinition[]
  handlers: Partial<Record<CommandId, CommandHandler>>
  available: (id: CommandId, args: CommandArgs) => boolean
  context: (event: KeyboardEvent) => CommandContext
  onError: (error: unknown) => void
  overrides?: BindingOverrides
}) => {
  const consumed = new WeakSet<KeyboardEvent>()
  const execute = (id: CommandId, args: CommandArgs = {}): boolean => {
    const handler = handlers[id]
    if (!handler || !available(id, args)) return false
    try {
      const result = handler(args)
      if (result && typeof (result as PromiseLike<unknown>).then === "function")
        void Promise.resolve(result).catch(onError)
    } catch (error) {
      onError(error)
    }
    return true
  }
  const handleKey = (event: KeyboardEvent): boolean => {
    if (consumed.has(event)) return true
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return false
    const current = context(event)
    if (current.editor) return false
    for (const definition of definitions) {
      if (!handlers[definition.id]) continue
      const bindings =
        overrides[definition.id]?.map((binding) => ({
          ...binding,
          context: definition.input === "app" ? ("global" as const) : ("workspace" as const),
        })) ?? definition.bindings
      const binding = bindings.find((item) => matches(event, item))
      if (!binding || (current.dialog && !definition.dialog)) continue
      if (binding.context === "workspace" && (!current.workspace || current.overlay)) continue
      const args = { fromKeyboard: true, sourceEvent: event }
      if (!available(definition.id, args)) continue
      event.preventDefault()
      consumed.add(event)
      if (!event.repeat || definition.repeat === "allow") execute(definition.id, args)
      return true
    }
    return false
  }
  return {
    execute,
    available: (id: CommandId, args: CommandArgs = {}) =>
      Boolean(handlers[id]) && available(id, args),
    handleKey,
    definitions,
  }
}
