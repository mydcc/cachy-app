/**
 * Terminal-title plugin: mirrors session state into the xterm/OSC title.
 *
 * Dual-runtime entrypoint:
 *   - v1 (>= 1.18.29): `server()` returns the v1 hook map, typed as `Hooks`.
 *   - v2 (>= 2.0): `setup(ctx)` subscribes to the server event stream.
 *
 * The v2 path is guarded, not assumed: `@opencode-ai/plugin@1.18.29` types a
 * plugin module as `{ id?, server, tui? }` and exposes neither `event.subscribe`
 * nor `tool.hook`, so on the runtime this repo pins those members are absent.
 * Guarding keeps a future runtime bump from turning into a `TypeError` inside a
 * floating promise. See `isV2Context` below.
 */

import type { Hooks, PluginModule } from "@opencode-ai/plugin"
import type {
  AssistantMessage,
  Event,
  EventMessageUpdated,
  EventSessionStatus,
  Message,
  SessionStatus,
} from "@opencode-ai/sdk"
import { closeSync, openSync, writeSync } from "node:fs"

const EMOJI: Record<string, string> = {
  initializing: "🚀",
  idle: "😴",
  thinking: "🤔",
  working: "🏃",
  tool_use: "🛠️",
}

function basename(p: string): string {
  const parts = p.split("/").filter(Boolean)
  return parts.length ? parts[parts.length - 1] : p
}

function workspaceName(dir: string): string {
  return basename(dir) || "unknown"
}

type TitleWriter = {
  setTitle(state: string): void
  dispose(): void
}

/**
 * Owns the /dev/tty handle and the last title written.
 *
 * `dispose` closes the fd and drops the exit listener. The listener exists so a
 * terminal that vanished mid-session does not turn a later write into an
 * unhandled error; without `dispose` a host that re-initialises the plugin would
 * leak one fd and one listener per cycle, and Node warns past ten listeners.
 */
function createTitleWriter(base: string): TitleWriter {
  let lastTitle = ""
  let tty: number | null = null

  try {
    tty = openSync("/dev/tty", "w")
  } catch {
    // No controlling terminal (daemon, CI, piped stdio). The title is cosmetic,
    // so a missing tty is not an error worth surfacing. `tty` is already null
    // when openSync throws, so there is nothing to reset.
  }

  // Captured as a const so the exit handler and setTitle close over the same
  // value without needing a cast: `tty` is `let`, and TypeScript widens a
  // captured `let` back to `number | null` inside a closure.
  const fd = tty

  const onExit = () => {
    if (fd === null) return
    try {
      closeSync(fd)
    } catch {
      // The terminal may already be gone; nothing useful to do here.
    }
  }

  if (fd !== null) process.on("exit", onExit)

  return {
    setTitle(state: string) {
      const emoji = EMOJI[state] ?? "🤖"
      const title = `${emoji} ${state} | ${workspaceName(base)}`
      if (title === lastTitle) return
      lastTitle = title
      try {
        if (fd !== null) {
          writeSync(fd, `\x1b]0;${title}\x07`)
        }
      } catch {
        // Terminal may be gone; the exit handler owns closing the fd.
      }
    },
    dispose() {
      if (fd === null) return
      process.off("exit", onExit)
      try {
        closeSync(fd)
      } catch {
        // Already closed by the exit handler, or the terminal is gone.
      }
    },
  }
}

// One writer per module load, keyed by nothing: both runtime entrypoints write
// the same terminal, and a second writer would hold a second fd while its own
// `lastTitle` cache defeats the dedup that keeps repeated states quiet.
let sharedWriter: TitleWriter | null = null

function writerFor(base: string): TitleWriter {
  if (sharedWriter === null) sharedWriter = createTitleWriter(base)
  return sharedWriter
}

/**
 * v1 `session.status` shape. `SessionStatus` is a discriminated union on
 * `type`, so the payload is read from the typed event rather than from an
 * untyped `properties` bag.
 */
function stateFromStatusEvent(event: Event): string | null {
  const status: SessionStatus | undefined = (event as EventSessionStatus).properties?.status
  if (status?.type === "busy") return "working"
  if (status?.type === "retry") return "thinking"
  if (status?.type === "idle") return "idle"
  return null
}

/** v1 `message.updated` shape. `Message` is `UserMessage | AssistantMessage`. */
function stateFromMessageEvent(event: Event): string | null {
  const info: Message | undefined = (event as EventMessageUpdated).properties?.info
  return (info as AssistantMessage | undefined)?.role === "assistant" ? "thinking" : null
}

/**
 * v1 events. Split from the v2 mapper on purpose: the two runtimes carry the
 * same information on different payload keys (`properties` vs `data`), and one
 * shared helper made that difference live in a comment instead of at the call
 * site.
 */
function stateFromV1Event(event: Event): string | null {
  switch (event.type) {
    case "session.created":
      return "initializing"
    case "session.status":
      return stateFromStatusEvent(event)
    case "message.updatedx":
      return stateFromMessageEvent(event)
    case "session.idle":
      return "idle"
    default:
      return null
  }
}

/**
 * The subset of the v2 context this plugin uses. Declared structurally so the
 * members are checked here rather than trusted, and so `isV2Context` can narrow
 * an unknown value to it.
 */
type V2Context = {
  location?: { directory?: string }
  event: {
    subscribe(options: { signal: AbortSignal }): AsyncIterable<{ type?: string; data?: unknown }>
  }
  tool: {
    hook(name: string, fn: () => void): Promise<void>
  }
}

/**
 * Narrows the v2 context. On the pinned runtime (`1.18.29`) `setup` is not part
 * of `PluginModule` and these members do not exist, so an unguarded
 * `ctx.event.subscribe(...)` would throw a `TypeError` inside a promise nothing
 * awaits — a failure that reads exactly like a plugin that is merely idle.
 */
function isV2Context(ctx: unknown): ctx is V2Context {
  if (typeof ctx !== "object" || ctx === null) return false
  const candidate = ctx as Partial<V2Context>
  return (
    typeof candidate.event?.subscribe === "function" && typeof candidate.tool?.hook === "function"
  )
}

/** v2 events carry their payload on `data` rather than on `properties`. */
function stateFromV2Event(event: { type?: string; data?: unknown }): string | null {
  switch (event.type) {
    case "session.created":
      return "initializing"
    case "session.status":
      return stateFromDataStatus(event.data)
    case "session.idle":
      return "idle"
    default:
      return null
  }
}

function stateFromDataStatus(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null
  const status = (data as { status?: SessionStatus }).status
  if (status?.type === "busy") return "working"
  if (status?.type === "retry") return "thinking"
  if (status?.type === "idle") return "idle"
  return null
}

const titlePlugin: PluginModule = {
  id: "title",

  async server(input): Promise<Hooks> {
    const base = input.worktree ?? input.directory ?? process.cwd()
    const writer = writerFor(base)
    return {
      event: async ({ event }) => {
        const state = stateFromV1Event(event)
        if (state) writer.setTitle(state)
      },
      "tool.execute.before": async () => {
        writer.setTitle("tool_use")
      },
      "tool.execute.after": async () => {
        writer.setTitle("working")
      },
      dispose: async () => {
        writer.dispose()
      },
    }
  },
}

export default titlePlugin

/**
 * The v2 entrypoint is installed only when the host calls it, which the pinned
 * `PluginModule` type does not describe. It is kept as a named export so a v2
 * host can reach it without changing this file's shape; on 1.18.x nothing
 * calls it.
 */
export const setup = async (ctx: unknown): Promise<() => void> => {
  if (!isV2Context(ctx)) {
    // Not a v2 host. Returning a no-op disposer keeps the contract (a teardown
    // function) intact without pretending the subscription exists.
    return () => {}
  }

  const base = ctx.location?.directory ?? process.cwd()
  const writer = writerFor(base)
  const controller = new AbortController()

  void (async () => {
    for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
      const state = stateFromV2Event(event)
      if (state) writer.setTitle(state)
    }
  })().catch(() => {
    // The stream ended or errored (server restart, session closed). A title
    // that stops updating is cosmetic; a rejected floating promise is not.
  })

  await ctx.tool.hook("execute.before", () => {
    writer.setTitle("tool_use")
  })
  await ctx.tool.hook("execute.after", () => {
    writer.setTitle("working")
  })

  return () => {
    controller.abort()
    writer.dispose()
  }
}
