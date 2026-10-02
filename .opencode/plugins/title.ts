import type { Plugin } from "@opencode-ai/plugin"
import { openSync, writeSync, closeSync } from "node:fs"

/**
 * Terminal title from session state.
 *
 * Dual-format so the same file serves both runtimes:
 *   - v1 (>= 1.18.29): `server()` returns the v1 hook map, typed as `Hooks`.
 *   - v2 (>= 2.0): `setup(ctx)` subscribes to the server event stream.
 *
 * v2 rejects a module without a `default` export, and v1 ignores `default` and
 * looks for `server()` — hence both on the same object rather than two files.
 */

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
	const m = dir.match(/\/google\/src\/cloud\/[^/]+\/([^/]+)/)
	if (m) return m[1]
	return basename(dir) || "unknown"
}

/**
 * Owns the /dev/tty handle and the last title written.
 *
 * The handle is opened once per plugin instance and closed on exit: reopening
 * it per keystroke would leak descriptors over a long session.
 */
function createTitleWriter(base: string) {
	let lastTitle = ""
	let tty: number | null = null

	try {
		tty = openSync("/dev/tty", "w")
	} catch {
		// No controlling terminal (service mode, CI, daemon). The title is
		// cosmetic, so a missing tty is not an error worth failing setup over.
		tty = null
	}

	function setTitle(state: string) {
		const emoji = EMOJI[state] ?? "🤖"
		const title = `${emoji} ${state} | ${workspaceName(base)}`
		if (title === lastTitle) return
		lastTitle = title
		try {
			if (tty !== null) writeSync(tty, `\x1b]0;${title}\x07`)
		} catch {
			// Terminal may be gone; ignore.
		}
	}

	process.on("exit", () => {
		if (tty !== null) closeSync(tty)
	})

	return { setTitle }
}

/** Maps a v1-shaped event payload onto a title state. */
function stateForEvent(type: string, properties: Record<string, unknown>): string | null {
	switch (type) {
		case "session.created":
			return "initializing"

		case "session.status": {
			const statusObj = properties.status as Record<string, unknown> | undefined
			const status = statusObj?.type
			if (status === "busy") return "working"
			if (status === "retry") return "thinking"
			if (status === "idle") return "idle"
			return null
		}

		case "message.updated": {
			const infoObj = properties.info as Record<string, unknown> | undefined
			return infoObj?.role === "assistant" ? "thinking" : null
		}

		case "session.idle":
			return "idle"

		default:
			return null
	}
}

// ---------------------------------------------------------------------------
// v1
// ---------------------------------------------------------------------------

export const TitlePlugin: Plugin = async ({ directory, worktree }) => {
	const base = worktree ?? directory ?? process.cwd()
	const { setTitle } = createTitleWriter(base)

	return {
		event: async ({ event }) => {
			const type = (event as { type?: string }).type
			if (!type) return
			const properties = (event as { properties?: Record<string, unknown> }).properties ?? {}
			const state = stateForEvent(type, properties)
			if (state) setTitle(state)
		},
		"tool.execute.before": async () => {
			setTitle("tool_use")
		},
		"tool.execute.after": async () => {
			setTitle("working")
		},
	}
}

// ---------------------------------------------------------------------------
// v2
// ---------------------------------------------------------------------------

/**
 * v2 moved the event payload from `.properties` to `.data`. Everything above
 * speaks the v1 shape, so the envelope is normalised here instead of forking
 * the state machine.
 */
function toV1Payload(envelope: unknown): { type: string; properties: Record<string, unknown> } | null {
	const e = envelope as { type?: string; data?: Record<string, unknown> } | undefined
	if (!e?.type) return null
	return { type: e.type, properties: e.data ?? {} }
}

async function v2Setup(ctx: unknown): Promise<() => void> {
	const v2ctx = ctx as {
		location?: { directory?: string; worktree?: string }
		event: { subscribe(options: { signal: AbortSignal }): AsyncIterable<unknown> }
		tool: {
			hook(
				name: "execute.before" | "execute.after",
				cb: () => void | Promise<void>,
			): Promise<unknown>
		}
	}

	// `worktree` is the git root and `directory` the CWD OpenCode was started
	// in; prefer the former so a session opened in a subdirectory is still
	// labelled with the repository.
	const base = v2ctx.location?.worktree ?? v2ctx.location?.directory ?? process.cwd()
	const { setTitle } = createTitleWriter(base)

	await v2ctx.tool.hook("execute.before", () => setTitle("tool_use"))
	await v2ctx.tool.hook("execute.after", () => setTitle("working"))

	const controller = new AbortController()
	void (async () => {
		try {
			for await (const event of v2ctx.event.subscribe({ signal: controller.signal })) {
				const payload = toV1Payload(event)
				if (!payload) continue
				const state = stateForEvent(payload.type, payload.properties)
				if (state) setTitle(state)
			}
		} catch {
			// The stream ends when the plugin is disposed. A stale terminal
			// title is never worth failing the server over.
		}
	})()

	return () => controller.abort()
}

export default {
	id: "title",
	server: TitlePlugin,
	setup: v2Setup,
}
