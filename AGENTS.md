# AGENTS.md

Cachy — Local-First Web App for Crypto Traders (Position Size Calculator, Risk Management, Trade Journal, Real-Time Market Data via Bitunix/Bitget). Code flows into a trading engine managing real money: Precision and verification always come before speed.

This file is the tool-agnostic single source of truth for all coding agents (Jules, Codex, Cursor, Antigravity, etc.). Claude Code additionally reads `CLAUDE.md` (Claude-specific, which references this file).

## Setup

```bash
npm install
npm run dev          # builds WASM first via scripts/build_wasm.sh
npm run build        # Production build (including WASM)
npm run check        # svelte-check — required before completion; mid-task cadence by blast radius
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

**Run targeted tests, not the whole suite.** `npm test` runs the full suite — both the `unit` and the `components` project — and is slow: the component tests mount every `.svelte` file with a DOM. After a change, run **only the tests your change affects** instead:

- **One test file:** `npx vitest run src/services/tradeService.test.ts`
- **A folder/pattern (substring match):** `npx vitest run src/services/tradeService`
- **Pure-logic `unit` project only (skips all `.svelte` component mounting):** `npm run test:unit`
- **Changed files only (git-based):** `npm run test:changed`
- **Component tests** (`*.component.test.ts`, `components` project): `npx vitest run src/components/shared/TpSlList.refusal.component.test.ts`

Reserve the full `npm test` for when you touched many files across projects or right before a merge/PR. A full `npm run check` is still required before completion regardless of the test scope — how often to run it mid-task is judgment-based, see "Verification Proportionality & Multi-Agent Resource Policy" below.

The dev/build process depends on the WASM module in `technicals-wasm/` (`scripts/build_wasm.sh`). Without this step, the build will fail — in cloud sandbox environments (e.g., Jules Environment Setup), this script must be part of the setup step.

## Verification Proportionality & Multi-Agent Resource Policy

Agents judge how much verification a change needs based on its blast radius — batch related edits and verify at logical milestones instead of re-running everything after every single save:

- **Trivial/local edit** (single component/util, no exported-signature changes): targeted tests for the touched files; full `npm run check` once before completion.
- **Cross-cutting change** (services, shared stores, types): targeted tests for all affected areas plus `npm run check`.
- **Core-critical areas** (position sizing, risk engine, exchange request signing, decimal.js math): always full targeted tests + check — resource pressure never lowers this bar.

When several worktrees are active on one machine:

- Larger test runs: set `VITEST_MAX_WORKERS=1` or use `npm run test:seq` (`--no-file-parallelism`) so sibling agents keep CPU headroom.
- `npm run check` runs at low scheduling priority automatically (via `scripts/run-lowpri.sh`); keep the number of runs proportionate anyway.
- Playwright/E2E only when the task touches end-to-end behavior; never run `npm run dev` inside a worktree.

Before every push — sync first, then verify, then push (a check on a stale branch is wasted work):

```bash
bash scripts/sync-develop.sh   # fetch + rebase onto origin/develop; exit 1 = conflicts, 2 = commit/stash first (only when behind), 3 = on the base branch
# resolve conflicts if any, then RE-RUN npm run check + relevant targeted tests
git push --force-with-lease    # after a successful rebase
```

Unchanged: a task is considered completed ONLY when `npm run check` and the relevant tests pass.

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

**Iframe & 3D Metaverse Protection (Non-Negotiable):**
- Never set `Cross-Origin-Embedder-Policy` (COEP) (neither `credentialless` nor `require-corp`). It breaks cross-origin iframes (Unity Metaverse `space.cachy.app`, embedded news articles, etc.).
- `Permissions-Policy` MUST delegate permissions needed for 3D Metaverse (`space.cachy.app`) and embedded views (camera, microphone, xr-spatial-tracking, display-capture, fullscreen, autoplay, accelerometer, gyroscope, clipboard-write, encrypted-media, picture-in-picture, web-share, geolocation). Never restrict them to empty `()` (e.g. `camera=()`, `geolocation=()`).
- `Content-Security-Policy` `frame-src` MUST allow `'self'`, `https://space.cachy.app`, `https://s.cachy.app`, `https:`, `blob:`, `data:`.

## Verification Before Marking Completed

Before marking a task completed: run `npm run check` and the affected tests — see "Run targeted tests, not the whole suite" above; mid-task cadence is judgment-based ("Verification Proportionality & Multi-Agent Resource Policy"). A task is considered completed ONLY when type checks and tests pass — do not claim completion beforehand.

## Tools & MCP — Mandatory for All Agents

Two MCP servers are configured for this project. **Both are required, not optional.** Every agent must use them before falling back to generic file-reading or grep.

### Gortex
Use for all code navigation, exploration, impact analysis, and graph queries.
- **Session start:** call `gortex__onboarding` (or `/gortex-guide`) to orient to the indexed codebase.
- Use `gortex__explore`, `gortex__search`, `gortex__impact`, `gortex__trace`, `gortex__safe-edit` for any non-trivial task.
- Available as slash commands: `/gortex-explore`, `/gortex-debug`, `/gortex-impact`, `/gortex-refactor`, `/gortex-safe-edit`, `/gortex-pr-review`, `/gortex-add-test`, etc.

### jCodeMunch
Use for code analysis, action routing, and semantic understanding.
- **Session start:** `order { "action": "resolve_repo", "args": { "path": "." } }` — confirm the project is indexed.
- `route { "query": "your task in a sentence" }` — picks the right action automatically.
- `menu { "query": "…" }` — discover available actions.
- `jcodemunch_guide` — full catalogue and rules.
- **Rule:** Prefer `route`/`order` over grep/Glob/find for code understanding. Never fall back to raw file search when jCodeMunch can answer the question.

### Working inside a git worktree
Graph tools resolve the repo from the current working directory. Inside a linked git worktree they only work after the worktree is registered with Gortex (jCodeMunch already maps any worktree path to the indexed root repo via `resolve_repo .`, so it needs no extra step).
- At the start of a session whose cwd is a git worktree (not the main checkout), run `bash scripts/index-worktree.sh` once. The script detects the worktree, registers it with `gortex call track_repository --arg as_worktree=true`, and indexes it; it is a safe no-op on the main checkout or outside a repo, and re-running is idempotent.
- After registration, `gortex__*` graph calls resolve against the worktree instance (shown as `<base>@<workspace>`) and jCodeMunch `resolve_repo .` returns the root repo id.
- **Registration alone is not enough — the client's working directory decides.** The MCP server reports its *own* process cwd to the daemon, so a client that spawns `gortex mcp` from a non-repo directory (typically `$HOME`) fails every call with `repository not tracked: <path>`, however correctly the repo is tracked. Passing a `path` or `repo` argument does not help: resolution happens before they are read.
- **Diagnose that before re-registering anything.** Run `gortex daemon status` and read the `cwd` column under **MCP sessions**: a row pointing at a non-repo directory is this problem, not a tracking gap. Fix it in that client's launch configuration — and note that some clients ignore an MCP config's `cwd` field entirely, so the directory may have to be forced in the launch command or wrapper script itself. A parent directory that holds the repos as direct children resolves in multi-repo mode and works as a general fallback.

Agent-specific config files (`CLAUDE.md`, `OPENCODE.md`) contain tool-specific startup sequences for their respective runtimes.


## Commits & Branches

- **Language:** Commits, Pull Request descriptions, and PR comments MUST ALWAYS be written in English. German is strictly forbidden in PR comments and commits.
- [Conventional Commits](https://www.conventionalcommits.org/) (`feat`, `fix`, `refactor`, `BREAKING CHANGE:` in footer).
- **No tool-attribution footers.** Do not append `Co-Authored-By: Claude ...`, `Claude-Session: ...`, or similar agent-attribution lines to commit messages — they aren't part of Cachy's commit standard. Keep the message to the Conventional Commits format above.
- **Never push directly to `develop` or `main`.** Every change goes through a feature branch and a Pull Request; target branch is always `develop`.
- **Pull Request Linking:** Every Pull Request MUST include `Fixes #<github_issue_number>` (e.g. `Fixes #1770`) at the start of its description so GitHub automatically links the PR with the issue and advances the Kanban card.
- **Writing *about* a closing reference.** GitHub parses closing keywords in **commit messages** as well as Pull Request descriptions, and backticks, quotation marks or surrounding prose do not exempt them. A commit body that quoted one shut an unrelated, unfixed P1 (see [`BUG-0220`](docs/backlog/bugs/BUG-0220-issue-autolink-substring-match.md)). The full keyword set is `close`/`closes`/`closed`, `fix`/`fixes`/`fixed`, `resolve`/`resolves`/`resolved` — **past tense counts too**, which is exactly how "it closed #1770" reads as harmless prose while still linking. Only the position directly before the reference matters, so either break the keyword (`Fixes #<!-- -->1770`) or keep it out of that position: write "#1770 was shut in error", not "closed #1770 in error".
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

Since multiple agents (e.g., Claude, Antigravity, Cursor, OpenCode) share the same local folder, conflicts arise (detached HEAD, inherited incomplete commits, index/file-watcher races) if agents work uncoordinatedly. Every agent **must** work in its own Git worktree (or Antigravity subagent with `Workspace: "share"`) — never directly in the shared checkout — before starting any task, not only when agents happen to run in parallel:

**Required sequence before any coding task:**
```bash
git fetch origin develop                              # get latest
git worktree add .worktrees/<branch> -b <branch> origin/develop
# then work exclusively in .worktrees/<branch>/
```

1. Create a dedicated worktree for the task (`git worktree add ...`, or the tool's built-in equivalent, e.g. Claude Code's `WorktreeCreate`).
2. Ensure that worktree's working directory is clean (`git status`).
3. Branch from `develop` inside the worktree.
4. (Optional) Fetch latest changes (`git pull`).

This is unconditional, not just for "true parallel work": a single agent working directly in the shared checkout still risks colliding with another agent's in-progress branch, uncommitted changes, or local tooling (e.g. Gortex/jCodeMunch reindex-on-edit hooks) reacting to files it didn't touch. Remove the worktree (`git worktree remove .worktrees/<branch>`) once its branch is merged or abandoned.

## Agent Lifecycle: Check, Claim, Clean Up

Every task follows the same three phases. The point is proactive conflict avoidance: with several agents working this repo in parallel, collisions are prevented *before* code is written, not discovered at merge time.

**1. Before starting (conflict check):**
1. `git fetch origin develop && git worktree list` — if another worktree or branch already covers your item or its files, coordinate instead of duplicating.
2. Read `docs/backlog/INDEX.md`: if the item is `in-progress` with an `assignee` that is not you, **stop** — the item is claimed.
3. Check open PRs (`gh pr list`) touching the same `area:`; mention potential overlap in the PR or item instead of silently competing.

**2. Claim (before the first commit):**
- In the item's front matter set `status: in-progress`, `assignee: <agent-name>` (`jules`, `codex`, `cursor`, `claude`, `opencode`, `human`, …), and note the branch name in the item. `npm run backlog:check` fails while an `in-progress` item has no `assignee` — that is intentional, so stale claims surface immediately.

**3. After finishing (mandatory cleanup — also when abandoning):**
- Retire your worktree — **both halves**: `bash scripts/worktree-cleanup.sh <branch>` from the main checkout removes the directory, untracks it from Gortex and deletes the merged branch in one step. `git worktree remove` alone untracks nothing, and a leftover tracked worktree is a full repo in the graph (~31k nodes), so a handful of them slows every graph query until `explore` hits its deadline. The script refuses anything dirty, unmerged or in use — never pass `--force` to work around that (`--force` only after saving uncommitted work as a patch outside the repo).
- Delete the branch once merged or abandoned; push first if its commits should be preserved.
- Update the item: `status: done` (+ shipped version) when merged; otherwise leave a short state note ("what exists, what is open") so the next agent can continue instead of doing archaeology.
- Never leave uncommitted changes behind: commit them to the branch or save a patch.

## Scope Guidance for Autonomous/Asynchronous Agents (e.g., Jules)

Well-suited for autonomous cloud sessions: Writing tests, checking i18n parity (DE/EN), maintaining documentation/backlog, isolated refactorings without behavior changes, dependency updates, accessibility fixes.

DO NOT merge autonomously without particularly thorough human review: Position size / risk calculations, signature / crypto logic for exchange requests, anything touching `decimal.js` precision or the Local-First boundary. Always have such PRs confirmed by a human review + `npm run check` + tests before merging to `develop`.

## Jules Sandbox Hygiene

A Jules session starts from a frozen sandbox clone that can be far behind `develop`. When the session merges or rebases mid-task, every develop change since the fork gets replayed as a revert commit — PRs then carry dozens of unrelated file reversals and package downgrades instead of the task's actual change (this clobbered PRs #2401 and #2404: 19 and 51 polluted files for 4 and 6 intended ones). Rules for every Jules task:

- **Never `git merge` or `git rebase` `origin/develop` mid-session.** Ignore base drift; change only what the task needs.
- **Commit only files you actually edited** (`git add <path> <path>`). Never `git add .`, `git add -A`, or whole-worktree commits.
- **`package.json` / `package-lock.json`** may be touched only for dependency updates; never lower the `version` field.
- **No sandbox artifacts in branches** (`todo.txt`, `.jules/` notes only when the task itself requires them).
- **Before pushing:** compare the PR's changed-file list against the task's intended files. If the list is larger, the sandbox is stale — abort the task instead of pushing.

Further documentation: `docs/README.md` (map), `docs/adr/` (binding decisions), `docs/backlog/INDEX.md` (open tasks).

Architecture overview: `docs/architecture/cachy-architecture.dataflow.html` (source of truth is the JSON next to it; regenerate with `npm run arch`). Read it first when touching services, exchange integrations, or anything that changes data flows or the Local-First boundary — and update the diagram in the same PR when your change moves data between device, cloud, or exchanges.
