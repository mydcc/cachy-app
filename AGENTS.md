# AGENTS.md

Cachy — Local-First Web App for Crypto Traders (Position Size Calculator, Risk Management, Trade Journal, Real-Time Market Data via Bitunix/Bitget). Code flows into a trading engine managing real money: precision and verification always come before speed.

This file is the single source of truth for all coding agents.

## Setup

```bash
npm install
npm run dev          # builds WASM first via scripts/build_wasm.sh
npm run build        # Production build (including WASM)
npm run check        # Type check via svelte-check (run on demand; CI verifies PRs automatically)
npm test             # Vitest unit tests
npm run test:e2e     # Playwright E2E
```

**Component tests.** A test that mounts a Svelte component is named
`*.component.test.ts` and runs in the `components` Vitest project, which is the
only place `svelte` resolves to its browser build — `mount()` throws from the
server entry. Do not set `resolve.conditions: ["browser"]` globally to avoid
that: it also flips `$app/environment`'s `browser` to true, which sends
`technicalsService` down its Worker path and fails two passing tests. `npm test`
runs both projects. Example: `src/components/shared/TpSlList.refusal.component.test.ts`.

**Playwright E2E:** Robust selectors (`getByRole`, `getByText`), `expect(locator).toBeVisible()` instead of fixed timeouts.

The dev/build process uses the WASM module in `technicals-wasm/` (`scripts/build_wasm.sh`). Without Rust the script keeps the committed `static/wasm/` artifacts and the build still succeeds — in cloud sandbox environments (e.g., Jules Environment Setup), including this script in the setup step still rebuilds the module when a toolchain is present.

## Testing instructions

**Verification: targeted, not banned.** Implement first, then verify — no test loops mid-task. Test the behavior you changed with the cheapest run that covers it, always through `scripts/run-lowpri.sh` (CPU affinity clamping to at most half cores via `taskset`, idle I/O via `ionice -c 3`, `nice -n 19`; local Vitest worker count defaults to max 2 in `vite.config.ts`):

- **One test file:** `bash scripts/run-lowpri.sh vitest run --project=unit src/services/tradeService.test.ts` (~1–3s)
- **One component test:** `bash scripts/run-lowpri.sh vitest run src/components/<path>/<name>.component.test.ts`
- **A folder/pattern:** `bash scripts/run-lowpri.sh vitest run --project=unit src/services/tradeService`
- **Changed files only (git-based):** `npm run test:changed`
- **Pure-logic `unit` project only:** `npm run test:unit`
- **WebGPU shaders or `webGpuCalculator.ts`:** `npm run test:gpu` (~10s). It holds every GPU indicator to the JS path in headless Chromium, which provides a software WebGPU adapter, so no GPU is needed. No CI workflow runs Playwright, so this suite is a local and pre-release gate: a green CI run says nothing about it.

Rules:

- Full suite (`npm test`, 300+ files) and project-wide `npm run check` (all Svelte components) are delegated to GitHub Actions CI. Run them locally only when explicitly requested by the user. At most 2 parallel Vitest processes, each via `run-lowpri.sh`.
- **Non-code changes** (documentation, markdown, shell scripts, root configs): no tests, no `npm run check`.
- **Money/exchange/risk paths** (position size, risk calculations, signature/crypto logic, `decimal.js` precision, Local-First boundary): always test + human review + green CI before merge.
- Reuse existing test suites; add new tests only for genuinely new behavior.

Before every push — sync first, then run targeted tests, then push:

```bash
bash scripts/sync-develop.sh   # fetch + rebase onto origin/develop; exit 1 = conflicts, 2 = commit/stash first (only when behind), 3 = on the base branch
# resolve conflicts if any, then run relevant targeted tests
git push --force-with-lease    # after a successful rebase
```

Before marking a task completed: targeted tests for changed code must pass; CI checks the Full Suite. Push review fixes to the same PR, never open a new PR without instruction.

## Repository structure

- `src/services/` — API/WebSocket services (Bitunix/Bitget), calculation logic. Tests alongside (`*.test.ts`).
- `src/stores/` — Svelte 5 rune stores (`*.svelte.ts`), tests alongside.
- `src/components/` — UI components (alerts, inputs, layout, results, settings, shared).
- `src/lib/` — Calculator core (`calculator.ts`), utilities, types.
- `src/routes/` — app shell (`+page.svelte`/`+layout.svelte`) plus `[[lang]]/(seo)/` pages (academy, changelog, guide, privacy, whitepaper). New UI strings always in **both** `src/locales/locales/{de,en}.json`.
- `server/` — SpacetimeDB module; has its own `server/CLAUDE.md` with separate rules.
- `technicals-wasm/` — WASM module for indicator calculations.

## Architecture boundaries

**Local-First Data Classes** (see `docs/adr/0001-local-first-boundary.md`):
- **Class A (never leaves device):** Journal, Settings, API Keys/Secrets, Presets, private notes, trade drafts. `localStorage` only. Never send to a server — not even telemetry, crash reports, or debug logs. (Exception: API Keys as credential of user-initiated exchange requests via proxy.)
- **Class B (may reside server-side):** Currently only Global Chat (SpacetimeDB, `server/spacetimedb/`). Only under all four conditions: opt-in and default off, authenticated (no anonymous access), minimal (no Class A data, not even as metadata), non-essential (Calculator, Journal, Risk Management work completely without server).
- **Class C (public market data & derived analytics):** Prices, klines, news, sentiment. Can reside anywhere but **never next to a user identity.** What symbols someone watches is user data. See `docs/adr/0004-spacetimedb-data-scope.md`.
- Every new Class B feature requires its own ADR. Moving a field from Class A to B is a `BREAKING CHANGE:`.
- **Core runs without server** (`docs/adr/0003-edition-boundary.md`): Core code — Calculator, Risk Engine, Journal, Presets, Notes, Settings, Exchange integrations, Indicators and their UI — **never** imports from `src/lib/spacetimedb/` or `src/services/cloudService.ts`. Not behind a flag, not in a try/catch. Server features are modules behind an interface.

**Planning & Documentation:** `docs/README.md` is the map — why Cachy exists (`docs/VISION.md`), where code lives (`docs/ARCHITECTURE.md`), what ships when (`docs/MILESTONES.md` → `docs/ROADMAP.md`), what is worked on (`docs/backlog/INDEX.md`), what cannot change (`docs/adr/`), what needs human decision (`docs/TODO.md`).
- **Link, never duplicate.** One fact lives in exactly one file.
- New task → backlog entry from `docs/backlog/templates/` (`npm run backlog:check` validates). When a PR touches any `docs/backlog/` file, regenerate the index (`node scripts/backlog-index.mjs`) and commit it **in that PR** — CI fails on a stale index.
- New decision that constrains future work → ADR (`docs/adr/template.md`), not a paragraph somewhere.

Architecture overview: `docs/architecture/cachy-architecture.dataflow.html` (source of truth is the JSON next to it; regenerate with `npm run arch`). Read it first when touching services, exchange integrations, or anything that changes data flows or the Local-First boundary — and update the diagram in the same PR when your change moves data between device, cloud, or exchanges.

## Coding standards

**Svelte 5 Runes Only** — Legacy syntax is strictly forbidden:
- `export let x` → `let { x } = $props()`
- `$: doubled = …` → `$derived(…)` / `$effect(…)`
- `createEventDispatcher` → Callback props (`onclick`)
- `<slot>` → Snippets `{#snippet …}`
- Every `$effect` that registers listeners/subscriptions MUST return a cleanup function.

**Financial Data:** `decimal.js` for ALL prices, amounts, balances. Native `number` is strictly forbidden for financial values.

**Theming:** No hardcoded colors (`#ffffff`, etc.). Use CSS variables (`var(--bg-primary)`, ...) or paired classes from `src/themes.css` (`.bg-accent-paired`, `.bg-success-paired`, `.bg-danger-paired`, `.bg-warning-paired`, `.hover-bg-accent-paired`).

**Performance:** No heavy computations (sort/filter/map) directly in template `{#each}` — prepare with `$derived` beforehand.

**Iframe & 3D Metaverse Protection (Non-Negotiable):**
- Never set `Cross-Origin-Embedder-Policy` (COEP) (neither `credentialless` nor `require-corp`). It breaks cross-origin iframes (Unity Metaverse `space.cachy.app`, embedded news articles, etc.).
- `Permissions-Policy` MUST delegate permissions needed for 3D Metaverse (`space.cachy.app`) and embedded views (camera, microphone, xr-spatial-tracking, display-capture, fullscreen, autoplay, accelerometer, gyroscope, clipboard-write, encrypted-media, picture-in-picture, web-share, geolocation). Never restrict them to empty `()` (e.g. `camera=()`, `geolocation=()`).
- `Content-Security-Policy` `frame-src` MUST allow `'self'`, `https://space.cachy.app`, `https://s.cachy.app`, `https:`, `blob:`, `data:`.

Do not delete code of unclear purpose. Leave copyright headers and metadata untouched. Remove `console.log` debug statements only upon explicit instruction.

## Tools & MCP

Two MCP servers are configured for this project. **Both are required, not optional.** Every agent must use them before falling back to generic file-reading or grep.

### Gortex
Use for all code navigation, exploration, impact analysis, and graph queries.
- **Session start:** call `gortex__onboarding` (or `/gortex-guide`) to orient to the indexed codebase.
- Use `gortex__explore`, `gortex__search`, `gortex__read`, `gortex__relations`, `gortex__trace`, `gortex__analyze` for navigation; `gortex__change(operation:"impact")` before any mutation.
- Available as slash commands: `/gortex-explore`, `/gortex-debug`, `/gortex-impact`, `/gortex-refactor`, `/gortex-pr-review`, etc.
- After switching branches, re-orient before the next call — never wait on a stale generation.
- On the first edit inside a fresh worktree, verify the `files[].path` prefix in the Edit response before continuing.
- A freshness-guaranteed call that waits longer than 5 minutes: abort it and retry without the freshness requirement.

### jCodeMunch
Use for code analysis, action routing, and semantic understanding.
- **Session start:** `order { "action": "resolve_repo", "args": { "path": "." } }` — confirm the project is indexed. If the repo is not indexed: `order { "action": "index_folder", "args": { "path": "." } }`.
- `route { "query": "your task in a sentence" }` — picks the right action automatically.
- `menu { "query": "…" }` — discover available actions.
- `jcodemunch_guide` — full catalogue and rules.
- **Rule:** Prefer `route`/`order` over grep/Glob/find for code understanding. Never fall back to raw file search when jCodeMunch can answer the question.
- **After editing files:** `order { "action": "register_edit", "args": { "paths": ["<edited-file>"] } }` so the index stays current (skip when PostToolUse hooks already reindex automatically).

## Philosophy: Act, Don't Ask

Default: act. Reversible and cheap? Do it, then report. Research, analysis, drafts, refactors inside the given scope, testing an API — execute first.
Ask first only for what reaches an audience (publish, send, post, share), cannot be undone (delete, force-push, schema migration, breaking changes), or is expensive (infrastructure changes, project-wide refactors).
Done means done: deliver everything asked; if one part is genuinely blocked, finish the rest and name the specific blocker in one sentence.
When unsure: follow existing code patterns; ask if it affects money paths, public API, or migrations; prefer reversible decisions.

## Commits & Branches

- **Branch naming:** `feature/…`, `fix/…`, `refactor/…`, `docs/…` — one branch per task.
- **PR size:** Aim for small PRs; if large, split into reviewable stages.
- **Language:** Commits, Pull Request descriptions, and PR comments MUST ALWAYS be written in English. German is strictly forbidden in PR comments and commits.
- [Conventional Commits](https://www.conventionalcommits.org/) (`feat`, `fix`, `refactor`, `BREAKING CHANGE:` in footer).
- **Commit message discipline (Linux-kernel style):** `subsystem: imperative summary, max ~72 chars, what + why` (e.g. `fix(positions): recompute PnL from live mark price`). One logical change per commit, one entry per PR — land PRs via squash-merge so the history stays readable without later filtering.
- **Release notes are curated by hand.** `CHANGELOG.md` is maintained per stable release (Added / Changed / Fixed, user language, minor fixes omitted). A release PR adds its highlights there, verified against the diff — no plugin writes to that file.
- **No tool-attribution footers.** Do not append `Co-Authored-By: Claude ...`, `Claude-Session: ...`, or similar agent-attribution lines to commit messages — they aren't part of Cachy's commit standard. Keep the message to the Conventional Commits format above.
- **WIP commits on agent branches:** Commit work-in-progress every 30–60 minutes as `wip(<scope>): <what is done, what is open>` (e.g. `wip(alerts): panel renders, sentence still mocked`). Large uncommitted diffs stall the code index (Gortex dirty-overlay) and risk lost work on crashes or rebases. Squash-merge flattens history anyway, so no cleanup is needed. Agent task branches only — never on `develop`/`main`.
- **Never push directly to `develop` or `main`.** Every change goes through a feature branch and a Pull Request; target branch is always `develop`.
- **Push and open the PR without asking.** Push the feature branch (`git push -u origin <branch>`) and open a PR against `develop` without waiting for confirmation. Ask only when something is off (failing tests, unclear base, suspected secrets). Open as **Ready** by default — Draft only for known-unfinished work, with a one-line reason in the description. Never merge without explicit instruction.
- **Pull Request Linking:** Every Pull Request MUST include `Fixes #<github_issue_number>` (e.g. `Fixes #1770`) at the start of its description so GitHub automatically links the PR with the issue and advances the Kanban card.
- **Backlog flip rides in the fix PR (no bots):** If the linked issue is a backlog mirror (`backlog-id:` label), the same PR MUST flip the item to `status: done` and commit the regenerated index (`node scripts/backlog-index.mjs` — plain Node, no install). CI fails the PR if either half is missing.
- **Writing *about* a closing reference.** GitHub parses closing keywords in **commit messages** as well as Pull Request descriptions, and backticks, quotation marks or surrounding prose do not exempt them. The full keyword set is `close`/`closes`/`closed`, `fix`/`fixes`/`fixed`, `resolve`/`resolves`/`resolved` — **past tense counts too**. Only the position directly before the reference matters, so either break the keyword (`Fixes #<!-- -->1770`) or keep it out of that position.

## Code Review Standard for All Agents

Every agent doing code review follows the same checklist:

1. **Identify the backlog item** — Does the PR title mention an item ID? Read `docs/backlog/` to understand Acceptance Criteria and Out of Scope.
2. **CI status** — Check if CI is green. Note only failures CI doesn't already report (e.g., decimal.js violations outside the hard-coded audit files, hardcoded strings missed by i18n checks, dead translations).
3. **Acceptance Criteria** — Does the diff actually satisfy them? No scope creep?
4. **Non-negotiable rules** — Svelte 5 runes only, no hardcoded colors, every `$effect` has cleanup, decimal.js for all financial math.
5. **Plain correctness** — Logic errors, unhandled edge cases, system boundary violations (swallowed exceptions, silent failures).
6. **Sensitive areas flag** — If `area: execution`, `area: security`, `area: exchange`, or `priority: P0`, flag **gently** as "👤 Human review recommended before merge" (no alarms, no uppercase shouting).
7. **Chat-first, comment after fixes** — Present findings with severity labels in chat first and wait for per-finding confirmation (never self-fix on silence). Post one PR comment only after the confirmed fixes are pushed (or stay commentless on a clean diff). Mark it `Code Review for <sha>` so it's recognized on re-runs.

## Agent-to-Agent Communication & Tone in PR Comments

When agents (Jules, Antigravity/Gemini, Claude Code, Codex, Cursor, etc.) review each other's PRs or reply to comments:

- **Language:** All PR comments MUST be written in **English**.
- **Tone:** Relaxed, friendly, and collegial ("Peer-to-Peer Agent Collaboration"). No authoritative, preachy, or alarmist language.
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

Since multiple agents (e.g., Claude, Antigravity, Cursor, OpenCode) share the same local folder, conflicts arise (detached HEAD, inherited incomplete commits, index/file-watcher races) if agents work uncoordinatedly. Every agent **must** work in its own session Git worktree — never directly in the shared checkout. One worktree per agent session is enough; a worktree per task is not required and actively harmful (a pile-up of stale worktree directories makes every checkout harder to reason about, and testing in the wrong worktree causes false results):

**Required sequence once per session:**
```bash
git fetch origin develop                              # get latest
git worktree add .worktrees/<session> -b <first-branch> origin/develop
# then work exclusively in .worktrees/<session>/
```

**Per task inside the session worktree:**
1. Ensure the tree is clean (`git status` — commit or stash pending work first).
2. Create a dedicated branch from fresh `develop` (`git fetch origin develop && git checkout -b <branch> origin/develop`) — one branch per task, one PR per branch, so unrelated changes stay separately reviewable and revertable.
3. Never carry uncommitted changes from one task into the next.

This is unconditional, not just for "true parallel work": a single agent working directly in the shared checkout still risks colliding with another agent's in-progress branch, uncommitted changes, or local tooling (e.g. Gortex/jCodeMunch reindex-on-edit hooks) reacting to files it didn't touch. Remove the session worktree (`git worktree remove .worktrees/<session>`) once the session ends.

Guideline: at most ~5 session worktrees at a time; run `git worktree prune` after every removal.

## Agent Lifecycle: Check, Claim, Clean Up

Every task follows the same three phases. The point is proactive conflict avoidance: with several agents working this repo in parallel, collisions are prevented *before* code is written, not discovered at merge time.

**0. Ownership (clarified before anything else):**
- Every agent touches only their own work: their own session worktree, their own task branch, items they claimed themselves. Never edit, delete, retire, or otherwise clean up another agent's worktree, branch, or claim — even if it looks stale or abandoned — unless explicitly instructed otherwise by the user, naming that exact work.
- When in doubt whether something is yours: `git worktree list` and the item `assignee` decide. If it is not yours, hands off and report instead of acting.

**1. Before starting (conflict check):**
1. `git fetch origin develop && git worktree list` — if another worktree or branch already covers your item or its files, coordinate instead of duplicating.
2. Read `docs/backlog/INDEX.md`: if the item is `in-progress` with an `assignee` that is not you, **stop** — the item is claimed.
3. Check open PRs (`gh pr list`) touching the same `area:`; mention potential overlap in the PR or item instead of silently competing.

**2. Claim (before the first commit):**
- In the item's front matter set `status: in-progress`, `assignee: <agent-name>` (`jules`, `codex`, `cursor`, `claude`, `opencode`, `human`, …), and note the branch name in the item. `npm run backlog:check` fails while an `in-progress` item has no `assignee` — that is intentional, so stale claims surface immediately.

**3. After finishing (mandatory cleanup — also when abandoning):**
- Retire your session worktree at session end with plain git: `git worktree remove .worktrees/<session>` from the main checkout. Never retire another agent's worktree (see Ownership above).
- After every merge, re-scan (`git worktree list` against open PRs): remove your own merged trees immediately, report someone else's stale trees by name instead of staying silent.
- After every merge, refresh your local main branch from GH (`git fetch origin develop`, fast-forward `develop` if it is checked out) so the next task starts from the current tip.
- Update the item: `status: done` (+ shipped version) when merged; otherwise leave a short state note ("what exists, what is open") so the next agent can continue instead of doing archaeology.
- Never leave uncommitted changes behind: commit them to the branch or save a patch.

## Scope Guidance for Autonomous/Asynchronous Agents (e.g., Jules)

Well-suited for autonomous cloud sessions: Writing tests, checking i18n parity (DE/EN), maintaining documentation/backlog, isolated refactorings without behavior changes, dependency updates, accessibility fixes.

DO NOT merge autonomously without particularly thorough human review: Position size / risk calculations, signature / crypto logic for exchange requests, anything touching `decimal.js` precision or the Local-First boundary. Always have such PRs confirmed by a human review + CI check + tests before merging to `develop`.

## Jules Sandbox Hygiene

A Jules session starts from a frozen sandbox clone that can be far behind `develop`. When the session merges or rebases mid-task, every develop change since the fork gets replayed as a revert commit — PRs then carry dozens of unrelated file reversals and package downgrades instead of the task's actual change. Rules for every Jules task:

- **Never `git merge` or `git rebase` `origin/develop` mid-session.** Ignore base drift; change only what the task needs.
- **Commit only files you actually edited** (`git add <path> <path>`). Never `git add .`, `git add -A`, or whole-worktree commits.
- **`package.json` / `package-lock.json`** may be touched only for dependency updates; never lower the `version` field. **`.node-version` and `engines` are raise-only:** never lower either — the pin must stay an exact version (no ranges, no `v` prefix) satisfying `engines` (enforced by the CI `node-version` job).
- **No sandbox artifacts in branches** (`todo.txt`, `.jules/` notes only when the task itself requires them).
- **Before pushing:** compare the PR's changed-file list against the task's intended files. If the list is larger, the sandbox is stale — abort the task instead of pushing.

## References

Further documentation: `docs/README.md` (map), `docs/adr/` (binding decisions), `docs/backlog/INDEX.md` (open tasks).

<!-- gortex:communities:start -->
## Community Skills

| Area | Description | Explore |
|------|-------------|---------|
| Services 42 Dirs | 856 symbols | `analyze(operation:"communities", id:"community-641")` |
| Server Venues 22 Dirs | 717 symbols | `analyze(operation:"communities", id:"community-767")` |
| Services 30 Dirs | 682 symbols | `analyze(operation:"communities", id:"community-447")` |
| Services 14 Dirs | 605 symbols | `analyze(operation:"communities", id:"community-745")` |
| Components Shared 24 Dirs | 454 symbols | `analyze(operation:"communities", id:"community-784")` |
| Utils 3 Dirs Fill | 450 symbols | `analyze(operation:"communities", id:"community-751")` |
| Components Settings 3 Dirs Viewertext | 395 symbols | `analyze(operation:"communities", id:"community-11")` |
| Services 5 Dirs Calculateindicatorsfromarrays | 350 symbols | `analyze(operation:"communities", id:"community-779")` |
| Services 10 Dirs Appfetch | 342 symbols | `analyze(operation:"communities", id:"community-419")` |
| Benchmarks 11 Dirs | 335 symbols | `analyze(operation:"communities", id:"community-514")` |
| Rules 3 Dirs | 297 symbols | `analyze(operation:"communities", id:"community-330")` |
| Rule 2 Dirs | 284 symbols | `analyze(operation:"communities", id:"community-813")` |
| Services 1 Dirs Calculate | 274 symbols | `analyze(operation:"communities", id:"community-644")` |
| Services 5 Dirs Encrypt | 263 symbols | `analyze(operation:"communities", id:"community-707")` |
| Services 6 Dirs Bitunixwebsocketservice | 257 symbols | `analyze(operation:"communities", id:"community-488")` |
| Chart 3 Dirs | 237 symbols | `analyze(operation:"communities", id:"community-310")` |
| Components Shared 5 Dirs Formatapinum | 230 symbols | `analyze(operation:"communities", id:"community-783")` |
| Utils 10 Dirs | 226 symbols | `analyze(operation:"communities", id:"community-746")` |
| Rule 1 Dirs Initialize | 221 symbols | `analyze(operation:"communities", id:"community-810")` |

<!-- gortex:communities:end -->
