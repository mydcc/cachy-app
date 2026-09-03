# CLAUDE.md

Cachy — Local-First web app for crypto traders (Position Size Calculator, Risk Management, Trade Journal, real-time market data via Bitunix/Bitget). Code flows into a trading engine managing real money: Precision and verification always come before speed.

This file is the Claude Code-specific extension of `AGENTS.md` (the tool-agnostic reference).

## Setup

```bash
npm run dev          # Dev server (builds WASM first via scripts/build_wasm.sh)
npm run build        # Production build (including WASM)
npm run check        # Type check via svelte-check (run on demand; CI verifies PRs automatically)
npm test             # Vitest unit tests
npm run test:e2e     # Playwright E2E tests
```

**Component tests.** A test that mounts a Svelte component is named
`*.component.test.ts` and runs in the `components` Vitest project, which is the
only place `svelte` resolves to its browser build — `mount()` throws from the
server entry. Do not set `resolve.conditions: ["browser"]` globally to avoid
that: it also flips `$app/environment`'s `browser` to true, which sends
`technicalsService` down its Worker path and fails two passing tests. `npm test`
runs both projects. Example: `src/components/shared/TpSlList.refusal.component.test.ts`.

**Verification Standard: Fast & Targeted.** `npm test` runs the full suite (300+ test files) and `npm run check` compiles all 160+ Svelte components. Running these full suites locally saturates CPU cores and freezes interactive work. **Full-suite regression testing and project-wide type checking are delegated to GitHub Actions CI.**

Locally, follow these rules:
- **No test loops mid-task:** Do not run tests or checks after every small intermediate edit. Focus on clean implementation first.
- **Fast targeted tests before commit/push:** Before committing or pushing code changes, run **only** the tests that cover your changes:
  - **One test file:** `npx vitest run src/services/tradeService.test.ts` (~1–3s)
  - **A folder/pattern:** `npx vitest run src/services/tradeService`
  - **Changed files only (git-based):** `npm run test:changed`
  - **Pure-logic `unit` project only:** `npm run test:unit`
- **Non-code changes:** If only documentation, markdown, shell scripts, or root configs are touched, tests and `npm run check` are completely unnecessary and are skipped.
- **Local resource protection:** Local Vitest worker count defaults to max 2 workers (`vite.config.ts`), and test scripts run through `scripts/run-lowpri.sh` (`taskset` CPU affinity clamping to at most half cores, idle I/O priority via `ionice -c 3`, and `nice -n 19`).

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

**Iframe & 3D Metaverse Protection (Non-Negotiable):**
- Never set `Cross-Origin-Embedder-Policy` (COEP) (neither `credentialless` nor `require-corp`). It breaks cross-origin iframes (Unity Metaverse `space.cachy.app`, embedded news articles, etc.).
- `Permissions-Policy` MUST delegate permissions needed for 3D Metaverse (`space.cachy.app`) and embedded views (camera, microphone, xr-spatial-tracking, display-capture, fullscreen, autoplay, accelerometer, gyroscope, clipboard-write, encrypted-media, picture-in-picture, web-share, geolocation). Never restrict them to empty `()` (e.g. `camera=()`, `geolocation=()`).
- `Content-Security-Policy` `frame-src` MUST allow `'self'`, `https://space.cachy.app`, `https://s.cachy.app`, `https:`, `blob:`, `data:`.

## Workflow

- **Verification over claims:** Run fast targeted tests for touched code before commit/push (see "Verification Standard: Fast & Targeted" above; full-suite and type verification is handled by CI).
- **Defensive deletion:** Never delete code of unclear purpose. Leave copyright headers and metadata untouched.
- **Keep debug logs:** Remove `console.log` statements only upon explicit instruction.
- **Playwright:** Robust selectors (`getByRole`, `getByText`), `expect(locator).toBeVisible()` instead of fixed timeouts.
- **Agent lifecycle:** Before any task run the conflict check, claim the backlog item (`status: in-progress` + `assignee:`), and clean up worktree, branch and item afterwards — see "Agent Lifecycle: Check, Claim, Clean Up" in `AGENTS.md`.

## MCP Tools

Call the `jcodemunch_guide` tool and strictly follow its instructions. This tool provides code analysis and improvements and is preferred for understanding and refactoring code in this repository.

**Gortex — Worktree Session Start (AUTOMATIC):** Every agent MUST run this before any other tool call — non-negotiable:

```bash
bash scripts/index-worktree.sh
```

This registers the worktree with Gortex so all graph tools (`gortex__explore`, `gortex__search`, `gortex__impact`, etc.) resolve correctly. The script is a safe no-op on the main checkout and idempotent on re-run. Skipping this step causes Gortex to report "cwd is not covered by any tracked repo" and fall back to plain file tools — losing all graph-based analysis.

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
- **Agent Isolation:** Before starting *any* task, create a dedicated Git worktree branched from a clean `develop` (`git status`) and work there — never directly in the shared checkout, even for single-agent tasks, since other local agents or file-watching tools (e.g. jCodeMunch's reindex-on-edit hook) may be mid-task there too. See `AGENTS.md` for the full routine.
