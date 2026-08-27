# OPENCODE.md

OpenCode-specific extension of `AGENTS.md` (tool-agnostic reference) and `CLAUDE.md` (also applies where relevant).

## MCP Tools — Mandatory Usage

Two MCP servers are configured for this project and **must** be used:

### 1. Gortex (`gortex` MCP)
Use Gortex for all code navigation, exploration, and graph analysis. Available as:
- Slash commands: `/gortex-explore`, `/gortex-debug`, `/gortex-impact`, `/gortex-refactor`, `/gortex-safe-edit`, `/gortex-pr-review`, etc.
- Direct MCP tools: `gortex__explore`, `gortex__search`, `gortex__read`, `gortex__relations`, `gortex__trace`, `gortex__analyze`

**Start of every session:** run `/gortex-guide` or call `gortex__onboarding` to orient to the indexed codebase.

### 2. jCodeMunch (`jcodemunch` MCP)
Use jCodeMunch for deeper code analysis, action routing, and improvement suggestions. Tools:
- `order { "action": "resolve_repo", "args": { "path": "." } }` — confirm project is indexed at session start
- `route { "query": "your task in a sentence" }` — picks the right action for any task
- `menu { "query": "what you are trying to do" }` — shows available actions
- `jcodemunch_guide` — full catalogue and usage rules

**Rule:** Prefer jCodeMunch (`route`/`order`) over grep/find for code understanding and navigation.
### Worktree sessions
Graph tools resolve the repo from the current working directory. Inside a linked git worktree they only work after the worktree is registered with Gortex (jCodeMunch already maps any worktree path to the indexed root repo via `resolve_repo .`, so it needs no extra step).
- At the start of a session whose cwd is a git worktree (not the main checkout), run `bash scripts/index-worktree.sh` once. It detects the worktree, registers it with `gortex call track_repository --arg as_worktree=true`, and indexes it; it is a safe no-op on the main checkout or outside a repo, and re-running is idempotent.
- After registration, `gortex__*` graph calls resolve against the worktree instance (shown as `<base>@<workspace>`); jCodeMunch `resolve_repo .` returns the root repo id.


## Git Worktree — Non-Negotiable

**Before starting ANY coding task** (no exceptions):

```bash
# 1. Fetch latest develop
git fetch origin develop

# 2. Create a dedicated worktree for the task
git worktree add .worktrees/<branch-name> -b <branch-name> origin/develop

# 3. Work only in that worktree — NEVER in the shared checkout
cd .worktrees/<branch-name>
```

**Why:** Claude, Antigravity, OpenCode, and jCodeMunch's reindex-on-edit hook all share the same directory. Working directly in the shared checkout causes HEAD conflicts, index races, and uncommitted-change collisions.

**Cleanup after merge/abandon:**
```bash
git worktree remove .worktrees/<branch-name>
git branch -d <branch-name>
```

See `AGENTS.md` § "Git Cleanliness and Parallel Agent Workspaces" for the full rationale.

## Non-Negotiable Rules (from AGENTS.md + CLAUDE.md)

- **Svelte 5 Runes only** — no `export let`, no `$:`, no `createEventDispatcher`, no `<slot>`
- **decimal.js** for ALL financial values — no native `number` for prices/amounts/balances
- **No hardcoded colors** — CSS variables or paired theme classes only
- **`npm run check` before completion** — task is only done when type check passes; mid-task cadence by blast radius (see AGENTS.md "Verification Proportionality")
- **Never push to `develop` or `main` directly** — always via feature branch + PR

## Commits & PRs

- English only in commits and PR descriptions
- Conventional Commits format (`feat:`, `fix:`, `refactor:`)
- No agent-attribution footers (`Co-Authored-By: ...`)
- Every PR needs `Fixes #<issue>` at the start of description
