# CLAUDE.md

Cachy — Local-First web app for crypto traders (Position Size Calculator, Risk Management, Trade Journal, real-time market data via Bitunix/Bitget). Code flows into a trading engine managing real money: Precision and verification always come before speed.

This file is the Claude Code-specific extension of `AGENTS.md` (the tool-agnostic reference). **`AGENTS.md` is the single source of truth** — rules, verification standard, MCP policy, commit/PR standards, and the agent lifecycle live there. This file adds only Claude Code-specific startup and reference content.

## Setup

See `AGENTS.md` → Setup (commands, component-test note, "Fast & Targeted" verification standard, WASM build requirement).

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

All non-negotiables — Local-First classes, Svelte 5 runes only (legacy syntax table), decimal.js for all financial values, theming via CSS variables, performance rule, Iframe/CSP protection — are defined once in `AGENTS.md` → Non-Negotiable Rules and apply here in full.

## Workflow

- **Verification over claims:** Run fast targeted tests for touched code before commit/push (see `AGENTS.md` → Setup → "Verification Standard: Fast & Targeted"; full-suite and type verification is handled by CI).
- **Playwright:** Robust selectors (`getByRole`, `getByText`), `expect(locator).toBeVisible()` instead of fixed timeouts.
- **Agent lifecycle:** Before any task run the conflict check, claim the backlog item (`status: in-progress` + `assignee:`), and clean up worktree, branch and item afterwards — see "Agent Lifecycle: Check, Claim, Clean Up" in `AGENTS.md`.

## MCP Tools

Call the `jcodemunch_guide` tool and strictly follow its instructions. This tool provides code analysis and improvements and is preferred for understanding and refactoring code in this repository.

**Gortex — Worktree Session Start (AUTOMATIC):** Every agent MUST run this before any other tool call — non-negotiable:

```bash
bash scripts/index-worktree.sh
```

This registers the worktree with Gortex so all graph tools (`gortex__explore`, `gortex__search`, `gortex__impact`, etc.) resolve correctly. The script is a safe no-op on the main checkout and idempotent on re-run. Skipping this step causes Gortex to report "cwd is not covered by any tracked repo" and fall back to plain file tools — losing all graph-based analysis.

## Commits & Branches

Commit/PR standards — English-only, Conventional Commits, no tool-attribution footers, never push to `develop`/`main`, `Fixes #<issue>` PR linking, and the BUG-0220 closing-keyword hazard — are defined once in `AGENTS.md` → Commits & Branches and apply here in full.
