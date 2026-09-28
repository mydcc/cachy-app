# OPENCODE.md

OpenCode-specific extension of `AGENTS.md` (tool-agnostic reference, also applies where relevant).

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

**Cleanup after merge/abandon (mandatory):**
```bash
git worktree remove .worktrees/<branch-name>
# git branch -D <branch-name>
```

See `AGENTS.md` § "Agent Lifecycle: Check, Claim, Clean Up".

## Non-Negotiable Rules (from AGENTS.md)

- **Svelte 5 Runes only** — no `export let`, no `$:`, no `createEventDispatcher`, no `<slot>`
- **decimal.js** for ALL financial values — no native `number` for prices/amounts/balances
- **No hardcoded colors** — CSS variables or paired theme classes only
- **Fast targeted tests before completion** — run only the tests covering your changes; full `npm test` / `npm run check` are delegated to CI (see AGENTS.md "Verification Standard: Fast & Targeted")
- **Never push to `develop` or `main` directly** — always via feature branch + PR

## Commits & PRs

- English only in commits and PR descriptions
- Conventional Commits format (`feat:`, `fix:`, `refactor:`)
- No agent-attribution footers (`Co-Authored-By: ...`)
- Every PR needs `Fixes #<issue>` at the start of description
- Always push the feature branch and open a PR against `develop` without asking (Ready by default, Draft only with a one-line reason); never merge without explicit instruction

## GitHub Actions & Reviews

- **Triggering a PR review:** Comment `/review`, `/oc review`, or `/oc code-review` on any PR. All of these route to the dedicated review runner (`review` job in `opencode.yml`), which enforces single-comment posting with bash disabled.
- **Unattended CI bot behavior:** Never call `gh pr comment` or `gh issue comment` directly from bash. The GitHub Actions action wrapper automatically captures your final assistant response and posts it as the single comment.
