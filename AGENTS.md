# AGENTS.md

Cachy — Local-First Web App for Crypto Traders (Position Size Calculator, Risk Management, Trade Journal, Real-Time Market Data via Bitunix/Bitget). Code flows into a trading engine managing real money: Precision and verification always come before speed.

This file is the tool-agnostic single source of truth for all coding agents (Jules, Codex, Cursor, Antigravity, etc.). Claude Code additionally reads `CLAUDE.md` (Claude-specific, which references this file).

## Setup

```bash
npm install
npm run dev          # builds WASM first via scripts/build_wasm.sh
npm run build        # Production build (including WASM)
npm run check        # svelte-check — run after EVERY change
npm test             # Vitest unit tests
npm run test:e2e     # Playwright E2E
```

The dev/build process depends on the WASM module in `technicals-wasm/` (`scripts/build_wasm.sh`). Without this step, the build will fail — in cloud sandbox environments (e.g., Jules Environment Setup), this script must be part of the setup step.

## Non-Negotiable Rules

**Local-First Data Classes** (see `docs/adr/0001-local-first-boundary.md`):
- Class A (Journal, Settings, API Keys, Presets, private notes) **never** leaves the device — `localStorage` only. Never send to a server, not even as telemetry/debug logs.
- Class B (currently only Global Chat via SpacetimeDB) is opt-in only, authenticated, minimal, non-essential.
- Class C (public market data) can reside anywhere, but never next to a user identity.
- Core code (Calculator, Risk Engine, Journal, Presets, Exchange integrations) **never** imports from `src/lib/spacetimedb/` or `src/services/cloudService.ts`.

**Svelte 5 Runes Only** — Legacy syntax is strictly forbidden:
- `export let x` → `let { x } = $props()`
- `$: doubled = …` → `$derived(…)` / `$effect(…)`
- `createEventDispatcher` → Callback props (`onclick`)
- `<slot>` → Snippets `{#snippet …}`
- Every `$effect` that registers listeners/subscriptions MUST return a cleanup function.

**Financial Data:** `decimal.js` for ALL prices, amounts, balances. Native `number` is strictly forbidden for financial values.

**Theming:** No hardcoded colors (`#ffffff`, etc.). Use CSS variables (`var(--bg-primary)`, ...) or paired classes from `src/themes.css` (`.bg-accent-paired`, `.bg-success-paired`, `.bg-danger-paired`, `.bg-warning-paired`, `.hover-bg-accent-paired`).

**Performance:** No heavy computations (sort/filter/map) directly in template `{#each}` — prepare with `$derived` beforehand.

## Verification Before Marking Completed

After every change: run `npm run check` and affected tests. A task is considered completed ONLY when type checks and tests pass — do not claim completion beforehand.

## Commits & Branches

- **Language:** Commits, Pull Request descriptions, and PR comments MUST ALWAYS be written in English. German is strictly forbidden in PR comments and commits.
- [Conventional Commits](https://www.conventionalcommits.org/) (`feat`, `fix`, `refactor`, `BREAKING CHANGE:` in footer).
- **No tool-attribution footers.** Do not append `Co-Authored-By: Claude ...`, `Claude-Session: ...`, or similar agent-attribution lines to commit messages — they aren't part of Cachy's commit standard. Keep the message to the Conventional Commits format above.
- **Never push directly to `develop` or `main`.** Every change goes through a feature branch and a Pull Request; target branch is always `develop`.
- **Pull Request Linking:** Every Pull Request MUST include `Fixes #<github_issue_number>` (e.g. `Fixes #1770`) at the start of its description so GitHub automatically links the PR with the issue and advances the Kanban card.
- **Writing *about* a closing reference.** GitHub parses closing keywords in **commit messages** as well as Pull Request descriptions, and backticks, quotation marks or surrounding prose do not exempt them. A commit body that quoted one closed an unrelated, unfixed P1 (see [`BUG-0220`](docs/backlog/bugs/BUG-0220-issue-autolink-substring-match.md)). To mention a reference without making one, break the keyword (`Fixes #<!-- -->1770`) or name the issue without it ("closed #1770 in error").
- Do not delete code of unclear purpose. Leave copyright headers and metadata untouched. Remove `console.log` debug statements only upon explicit instruction.

## Code Review Standard for All Agents

Every agent doing code review follows the same checklist in `/backlog-review`:

1. **Identify the backlog item** — Does the PR title mention an item ID? Read `docs/backlog/` to understand Acceptance Criteria and Out of Scope.
2. **CI status** — Check if CI is green. Note only failures CI doesn't already report (e.g., decimal.js violations outside the hard-coded audit files, hardcoded strings missed by i18n checks, dead translations).
3. **Acceptance Criteria** — Does the diff actually satisfy them? No scope creep?
4. **Non-negotiable rules** — Svelte 5 runes only, no hardcoded colors, every `$effect` has cleanup, decimal.js for all financial math.
5. **Plain correctness** — Logic errors, unhandled edge cases, system boundary violations (swallowed exceptions, silent failures).
6. **Sensitive areas flag** — If `area: execution`, `area: security`, `area: exchange`, or `priority: P0`, flag **gently** as "👤 Human review recommended before merge" (no alarms, no uppercase shouting).
7. **Comment marker** — Post one PR comment (only if findings exist or for explicit tracking). Mark it `Code Review for <sha>` so it's recognized on re-runs.

Reviewers are any agent with access to the PR and codebase; this is not Jules-specific.

## Agent-to-Agent Communication & Tone in PR Comments

When agents (Jules, Antigravity/Gemini, Claude Code, Codex, Cursor, etc.) review each other's PRs or reply to comments:

- **Language:** All PR comments MUST be written in **English**.
- **Tone:** Relaxed, friendly, and collegial ("Peer-to-Peer Agent Collaboration"). No authoritative, preachy, or alarmist language. At the end of a review, agents are encouraged to leave a friendly one-liner or greet/thank fellow agents (e.g. `@jules thanks for restoring the test assertions!`, `Looks neat, good job!`).
- **Human Review Flag (Gentle Note, No Alarms):** If a PR touches sensitive areas (`area: execution`, `area: security`, `area: exchange`, or `priority: P0`), flag this **without red dots (no 🔴 / ⚠️)** and **without shouting/uppercase titles** (`NEEDS HUMAN REVIEW BEFORE MERGE` or German equivalents are strictly forbidden). Use a friendly, unobtrusive note with neutral/friendly emojis (e.g. `👤` or `👀`), such as:
  - `👤 Note: Human review recommended before merge`
  - `👀 Quick human check suggested`

## Backlog Items: Do Not Autonomously Pick and Solve

`docs/backlog/` is the single source of truth for upcoming work. This rule concerns **how a task comes about, not which agent it is** — there is no special role for any specific tool. Two modes:

- **Autonomous/Unattended Selection** ("I'll see what's open in the backlog and solve it") — **no** agent does this, whether Jules, Antigravity, Cursor, Codex, or Claude Code. Instead:
  1. Complete missing parts — clarify Acceptance Criteria, Out of Scope, open questions in the fix proposal (see `docs/backlog/README.md`) — and set `status` to `ready` once the item is complete.
  2. Actual implementation runs through the designated, filtered pipeline: `.github/workflows/backlog-dispatch.yml` (`scripts/jules/dispatch-backlog.mjs`, weekly or manually via workflow dispatch) sends `ready` items to Jules. This pipeline — not Jules as a tool — enforces safety filters: `area: execution`, `area: security`, `area: exchange`, and `priority: P0` are intentionally **never automatically dispatched**, requiring manual handoff (`scripts/jules/create-session.sh --file ...`) only after a human inspects the item.
- **Explicit Human Instruction** ("solve BUG-0053 now") — any capable agent may do this regardless of tool. This is directed work, not backlog grabbing, and does not require a dispatch pipeline.

An agent may read, expand, discuss a backlog bug with the user (cf. `/backlog-groom` workflow), and set it to `ready` at any time — but it opens a PR with the actual fix implementation ONLY when explicitly instructed by the user in that specific case, or when selected via the dispatch pipeline with its filters.

## Git Cleanliness and Parallel Agent Workspaces

Since multiple agents (e.g., Claude, Antigravity, Cursor) share the same local folder, conflicts arise (detached HEAD, inherited incomplete commits) if agents work uncoordinatedly. Every agent **must** follow this startup routine before starting a new task or creating a feature branch:
1. Ensure the working directory is clean (`git status`).
2. Switch to the `develop` branch (`git checkout develop`).
3. (Optional) Fetch latest changes (`git pull`).

For true parallel work, Git Worktrees (or Antigravity subagents with `Workspace: "share"`) **must** be used so each agent gets its own isolated working directory and does not pull the branch out from under another agent.

## Scope Guidance for Autonomous/Asynchronous Agents (e.g., Jules)

Well-suited for autonomous cloud sessions: Writing tests, checking i18n parity (DE/EN), maintaining documentation/backlog, isolated refactorings without behavior changes, dependency updates, accessibility fixes.

DO NOT merge autonomously without particularly thorough human review: Position size / risk calculations, signature / crypto logic for exchange requests, anything touching `decimal.js` precision or the Local-First boundary. Always have such PRs confirmed by a human review + `npm run check` + tests before merging to `develop`.

Further documentation: `docs/README.md` (map), `docs/adr/` (binding decisions), `docs/backlog/INDEX.md` (open tasks).
