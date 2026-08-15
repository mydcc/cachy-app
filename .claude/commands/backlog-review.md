---
description: Review open PRs against backlog acceptance criteria and CLAUDE.md/AGENTS.md rules, post findings as PR comment
---

Review open PRs in `mydcc/cachy-app` against their backlog item (if linked) and Cachy's non-negotiable rules (CLAUDE.md, AGENTS.md). This is oversight, not execution: never fix, commit, or merge — only report findings.

**This command works for any agent** (Jules, Claude Code, Cursor, Codex, Antigravity, etc.), not Jules-specific. It uses backlog item metadata to structure the review.

## Scope: Which PRs to Review

Run this command in three ways:

1. **All open PRs** (default) — review every open PR against its backlog item if one is linked
2. **A specific PR** (pass `--pr <number>`) — review only PR #N
3. **PRs by a specific agent** (pass `--author <login>`) — review open PRs from a named author (e.g. `--author jules`)

If you're an agent reviewing your own work: use `--author <your-login>` to focus on your PRs. If you're a human or a different agent reviewing: use the default (all) or `--pr` for a specific one.

## Steps

1. **Identify the backlog item.**
   - Read the PR title — often starts with `TASK-123:` or `BUG-456:`.
   - If the PR body contains `Fixes #<issue_number>` (e.g. `Fixes #1770`), that's the linked backlog item. Read `docs/backlog/features/<id>.md` or `docs/backlog/bugs/<id>.md` — especially **Acceptance Criteria** and **Out of Scope**.
   - If no link is found, note it but continue the review (PR may be standalone).

2. **Check CI status.**
   - Is the check suite green? If red, note only failures that CI doesn't already enumerate.
   - **CI-independent findings** (flag these if found):
     - Decimal.js violations outside hard-coded audit files (`.github/workflows/audit.yml` only greps `src/services/tradeService.ts`, `src/services/apiService.ts`, `src/lib/calculator.ts`). A native `number` used for prices in a new service/store/component is invisible to CI.
     - Hardcoded strings in template literals passed to helpers (e.g., `toastService.error('hardcoded text')`). CI's i18n checker has blind spots.
     - Dead translations — a key added to a locale file but never referenced in code.
   - Do not repeat what CI already reported (ESLint, TypeScript, `check-translations`, Conventional Commits failures).

3. **Acceptance Criteria vs. Scope Creep.**
   - Does the diff satisfy every acceptance criterion? Marked `[x]` is not enough — verify they're actually true.
   - Does the diff stay within "Out of Scope"? Flag any creep.

4. **Non-Negotiable Rules** (from CLAUDE.md / AGENTS.md):
   - **Svelte 5 Runes Only** — no `export let`, `$:`, `createEventDispatcher`, `<slot>`. Use `$props()`, `$derived()`, `$effect()`, snippets instead.
   - **No hardcoded colors** — use `var(--bg-primary)` etc. or paired classes from `src/themes.css`.
   - **Every `$effect` with listeners/subscriptions must return a cleanup function.**
   - **Decimal.js for all prices/amounts/balances** — native `number` is forbidden for financial math.
   - **Local-First Boundary** (see `docs/adr/0001-local-first-boundary.md`) — Class A data (Journal, Settings, API Keys, private notes) never leaves the device.
   - **Core code never imports server features** (`src/lib/spacetimedb/`, `src/services/cloudService.ts`) — server is optional, not core.

5. **Plain Correctness.**
   - Logic errors, silent failures, unhandled edge cases, missing boundaries (what happens when an API times out? when a balance is zero?).

6. **Sensitive Areas Flag.**
   - If the PR or its backlog item has `area: execution`, `area: security`, `area: exchange`, or `priority: P0`: flag gently as "👤 Human review recommended before merge" (no red dots, no uppercase alarms).
   - These are exactly what the dispatch pipeline intentionally excludes, because mistakes cost real money.

7. **Post a Comment** (only if findings exist).
   - Use `add_issue_comment` with this structure:
     - **Header:** `Code Review für <sha>` (short SHA is fine) — this marker lets step 1 skip if already reviewed.
     - **Verdict:** One-line summary (e.g., "Clean by CLAUDE.md rules, but acceptance criterion #2 not met").
     - **Findings:** Grouped by the checks above (Acceptance Criteria, CI-independent findings, Non-Negotiable Rules, Correctness, Sensitive Areas).
     - **Footer:** Friendly tone, collegial ("Looks good!" or "Worth a quick human double-check on the decimal.js usage here"). End with GitHub attribution per AGENTS.md.
   - If the diff is clean and no backlog item exists, skip the comment entirely (no noise).

## Example Comment

```
Code Review für a1b2c3d

**Verdict:** Acceptance criteria met, clean by CLAUDE.md rules.

**Acceptance Criteria:**
- ✓ Position size calculator handles fractional contracts (tested in unit tests)
- ✓ Risk window UI shows "N/A" when balance is zero
- ✓ I18n strings for both DE and EN

**CI Status:** Green.

**Non-Negotiable Rules:** All checks pass — Svelte 5 runes, no hardcoded colors, decimal.js used for all prices.

**Sensitivity Check:** `area: execution` applies here. 👤 Human review recommended before merge (the position calc is core-critical).

---
_Generated by [Claude Code](https://claude.ai/code)_
```

## Notes

- **Read-only towards the codebase.** Only write: the PR comment. No commits, pushes, merges, or backlog edits.
- **If unsure, say so.** Better to voice uncertainty than to stay silent or invent confidence.
- **Peer collaboration.** Tone is friendly and collegial, not authoritative. If reviewing another agent's PR, greet them (e.g., "Thanks for this, @jules!").
- **Marker reuse:** If a new commit lands on an already-reviewed PR, post a new comment with an updated marker line (`Code Review für <new-sha>`) so the next review run knows something changed.
