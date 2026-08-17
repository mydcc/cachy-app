# CLAUDE.md

Cachy — Local-First web app for crypto traders (Position Size Calculator, Risk Management, Trade Journal, real-time market data via Bitunix/Bitget). Code flows into a trading engine managing real money: Precision and verification always come before speed.

This file is the Claude Code-specific extension of `AGENTS.md` (the tool-agnostic reference).

## Setup

```bash
npm run dev          # Dev server (builds WASM first via scripts/build_wasm.sh)
npm run build        # Production build (including WASM)
npm run check        # svelte-check — run after EVERY change
npm test             # Vitest unit tests
npm run test:e2e     # Playwright E2E tests
```

## Architecture

**Local-First Data Classes** (see `docs/adr/0001-local-first-boundary.md`):
- **Class A (never leaves device):** Journal, Settings, API Keys/Secrets, Presets, private notes, trade drafts. `localStorage` only. Never send to a server — not even telemetry, crash reports, or debug logs. (Exception: API Keys as credential of user-initiated exchange requests via proxy.)
- **Class B (may reside server-side):** Currently only Global Chat (SpacetimeDB, `server/spacetimedb/`). Only under all four conditions: opt-in and default off, authenticated (no anonymous access), minimal (no Class A data, not even as metadata), non-essential (Calculator, Journal, Risk Management work completely without server).
- **Class C (public market data & derived analytics):** Prices, klines, news, sentiment. Can reside anywhere but **never next to a user identity.** What symbols someone watches is user data. See `docs/adr/0004-spacetimedb-data-scope.md`.
- Every new Class B feature requires its own ADR. Moving a field from Class A to B is a `BREAKING CHANGE:`.
- Never phrase Local-First as an absolute ("no server persistence") — that was wrong and decoupled docs from code.
- **Core runs without server** (`docs/adr/0003-edition-boundary.md`): Core code — Calculator, Risk Engine, Journal, Presets, Notes, Settings, Exchange integrations, Indicators and their UI — **never** imports from `src/lib/spacetimedb/` or `src/services/cloudService.ts`. Not behind a flag, not in a try/catch. Server features are modules behind an interface.

**Directory Structure:**
- `src/services/` — API/WebSocket services (Bitunix/Bitget), calculation logic. Tests alongside (`*.test.ts`).
- `src/stores/` — Svelte 5 rune stores (`*.svelte.ts`), tests alongside.
- `src/components/` — UI components (inputs, layout, results, settings, shared).
- `src/lib/` — Calculator core (`calculator.ts`), utilities, types.
- `src/routes/[[lang]]/` — i18n routing (German + English, `src/locales/`). New UI strings always in **both** languages.
- `server/` — SpacetimeDB module; has its own CLAUDE.md with separate rules.
- `technicals-wasm/` — WASM module for indicator calculations.

## Planning & Documentation

`docs/README.md` is the map — see which doc serves which purpose. Quick reference:

| Question | Document |
|---|---|
| Why does Cachy exist? | `docs/VISION.md` |
| Where is what code? | `docs/ARCHITECTURE.md` |
| What ships when? | `docs/MILESTONES.md` → `docs/ROADMAP.md` |
| What am I working on? | `docs/backlog/INDEX.md` |
| What can't I change? | `docs/adr/` |
| What needs human decision? | `docs/TODO.md` |

- **Link, never duplicate.** One fact lives in exactly one file. Two copies of a rationale is why docs stop matching code (see `docs/REPO-AUDIT.md`).
- New task → Create backlog entry from `docs/backlog/templates/`. `npm run backlog:check` validates front matter and id/number collisions. Never run `npm run backlog:index` and commit `INDEX.md` yourself — CI regenerates and commits it directly to `develop` after merge, so it never appears in a PR diff (see `docs/backlog/README.md`).
- New decision that constrains future work → ADR (`docs/adr/template.md`), not a paragraph somewhere.

## Non-Negotiable Rules

**Svelte 5 Runes Only** — Legacy syntax is strictly forbidden.

| Forbidden (Legacy) | Use Instead |
|---|---|
| `export let x` | `let { x } = $props()` |
| `$: doubled = …` | `$derived(…)` / `$effect(…)` |
| `createEventDispatcher` | Callback props (`onclick`) |
| `<slot>` | Snippets `{#snippet …}` |

- State: `let count = $state(0);`
- Every `$effect` that registers listeners/subscriptions **must** return a cleanup function.

**Financial Data:** `decimal.js` for ALL prices, amounts, balances. Native `number` strictly forbidden for financial values (rounding errors = money loss).

**Theming (20+ themes):** No hardcoded colors (`#ffffff`, etc.). Use CSS variables (`var(--bg-primary)`, `var(--text-secondary)`, …) or paired classes from `src/themes.css` (`.bg-accent-paired`, `.bg-success-paired`, `.bg-danger-paired`, `.bg-warning-paired`, `.hover-bg-accent-paired`).

**Performance:** No heavy computations (sort/filter/map) directly in template `{#each}` — prepare data with `$derived` beforehand.

## Workflow

- **Verification over claims:** After every code change, run `npm run check` and affected tests (skill `/verify`). Only then claim completion.
- **Defensive deletion:** Never delete code of unclear purpose. Leave copyright headers and metadata untouched.
- **Keep debug logs:** Remove `console.log` statements only upon explicit instruction.
- **Playwright:** Robust selectors (`getByRole`, `getByText`), `expect(locator).toBeVisible()` instead of fixed timeouts.

## MCP Tools

Call the `jcodemunch_guide` tool and strictly follow its instructions. This tool provides code analysis and improvements and is preferred for understanding and refactoring code in this repository.

- **First action, always:** Before accepting or starting any task, call jCodeMunch `order { "action": "resolve_repo", "args": { "path": "." } }`. If `indexed` is `false`, immediately run `order { "action": "index_folder", "args": { "path": "." } }` (with `allow_state_change: true`) before doing anything else. This is mandatory for every agent session, not optional context-gathering.
- **Work locally through jCodeMunch to save tokens.** Prefer jCodeMunch actions (`search_symbols`, `get_ranked_context`, etc.) over Grep/Glob/Read for exploration — this is why tasks are executed locally in the first place, not just a style preference.

## Codebase Understanding for All Agents

This CLAUDE.md and `AGENTS.md` apply to **all coding agents** — Claude Code, Jules, Cursor, Codex, Antigravity, etc. Agents following these project rules (not just tool defaults) have deeper understanding:

- **Non-negotiable rules** (Svelte-5-Only, decimal.js, Theming, Performance) are boundary conditions — not "nice to have", but requirements that cost money or functionality if ignored.
- **Read backlog items** (`docs/backlog/`) to see what should be done and why. Acceptance Criteria define success. Out of Scope prevents creep.
- **Read ADRs** (`docs/adr/`) to understand why some architecture decisions are irreversible.
- **Local-First Boundary** (Classes A/B/C) is non-negotiable — violation = data leak or fraud.

Code reviews (`/backlog-review` skill) enforce these rules automatically, but no review replaces manual reading.

## Commits & Branches

- **Language:** Commits and PR descriptions MUST be in English. Never German in commits or PR comments.
- **Conventional Commits:** `feat:` (Minor), `fix:` (Patch), `refactor:` (no release), `BREAKING CHANGE:` in footer for Major.
- **No tool-attribution footers.** Do not append `Co-Authored-By: Claude ...`, `Claude-Session: ...`, or similar lines to commit messages — not part of Cachy's commit standard.
- **Never push directly to `develop` or `main`.** Every change goes through a feature branch and PR; target is always `develop`, never `main`.
- **Pull Request Linking:** Every PR MUST include `Fixes #<github_issue_number>` (e.g., `Fixes #1770`) at the start of its description so GitHub auto-links the PR with the issue and advances the Kanban card.
- **Writing *about* a closing reference.** GitHub parses closing keywords in **commit messages** too, not just PR descriptions — and backticks, quotes or surrounding prose do not exempt them. A commit body quoting one shut an unrelated, unfixed P1 (see `docs/backlog/bugs/BUG-0220-issue-autolink-substring-match.md`). The full keyword set is `close`/`closes`/`closed`, `fix`/`fixes`/`fixed`, `resolve`/`resolves`/`resolved` — **past tense counts**, which is how "it closed #1770" reads as harmless prose and is not. Only the position directly before the reference matters. So either break the keyword (`Fixes #<!-- -->1770`) or keep it away from that position: "#1770 was shut in error", not "closed #1770 in error".
- **Agent Isolation:** Before starting work, ensure you're on a clean `develop` branch (`git checkout develop`, `git status`). Use Git worktrees for parallel tasks to avoid conflicts with other agents in the same directory (see `AGENTS.md`).
