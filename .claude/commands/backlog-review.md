---
description: Review open PRs against backlog acceptance criteria and Cachy rules, reconcile with bot review, fix findings, commit, push, and re-trigger bot review
model: claude-sonnet-5
---

Review open PRs in `mydcc/cachy-app` against their backlog item (if linked) and Cachy's non-negotiable rules (CLAUDE.md, AGENTS.md). This is review, reconcile, then fix: list findings first, reconcile them with the bot review, then fix, commit, and push — never merge.

**This command works for any agent** (Jules, Claude Code, Cursor, Codex, Antigravity, etc.), not Jules-specific. It uses backlog item metadata to structure the review.

## Model & Token Efficiency

**Recommended Model:** Claude Sonnet 5 (best cost/quality balance for code review)

**Token Optimization via Prompt Caching:** This command caches the stable review rules:
- `CLAUDE.md` (non-negotiable rules: Svelte 5, decimal.js, theming, Local-First)
- `AGENTS.md` (review standard checklist)
- This command file itself (process and example)

After the first review, subsequent reviews hit the cache → ~60-80% token savings. The cache is valid for 5 minutes; if you run multiple reviews in quick succession, the savings compound.

When to use Haiku 4.5 instead: For small, routine PRs where you won't run another review within 5 minutes (cache expires, not worth the setup).

## Scope: Which PRs to Review

Run this command in three ways:

1. **All open PRs** (default) — review every open PR against its backlog item if one is linked
2. **A specific PR** (pass `--pr <number>`) — review only PR #N
3. **PRs by a specific agent** (pass `--author <login>`) — review open PRs from a named author (e.g. `--author jules`)

If you're an agent reviewing your own work: use `--author <your-login>` to focus on your PRs. If you're a human or a different agent reviewing: use the default (all) or `--pr` for a specific one.

## Steps

1. **OCR delegation pre-filter (best-effort, read-only).**
   - Run Alibaba `open-code-review` in delegation mode — deterministic file selection + rule matching, no LLM key needed, produces no verdict of its own:
     ```bash
     npx -y @alibaba-group/open-code-review delegate preview --from origin/develop --to <pr-head-sha>
     npx -y @alibaba-group/open-code-review delegate rule <reviewable-path> [<reviewable-path>...]
     ```
     Single commit: `delegate preview -c <sha>`; uncommitted local changes: bare `delegate preview`.
   - Treat the output as input only: the reviewable-file list scopes steps 2–10, the rule groups are hints. Cachy rules (step 5) always win on conflict; drop OCR-only Low/style nits.
   - **Manually review everything OCR excluded** — it excludes test files via `default_path` (proven gap on PR #3419). Excluded ≠ approved.
   - If `ocr` or bash is unavailable (e.g. CI review runner with bash disabled) or the command fails: skip silently and continue — never block the review on this step.

2. **Identify the backlog item.**
   - Read the PR title — often starts with `TASK-123:` or `BUG-456:`.
   - If the PR body contains `Fixes #<issue_number>` (e.g. `Fixes #1770`), that's the linked backlog item. Read `docs/backlog/features/<id>.md` or `docs/backlog/bugs/<id>.md` — especially **Acceptance Criteria** and **Out of Scope**.
   - If no link is found, note it but continue the review (PR may be standalone).

3. **Check CI status.**
   - Is the check suite green? If red, note only failures that CI doesn't already enumerate.
   - **CI-independent findings** (flag these if found):
     - Decimal.js violations outside hard-coded audit files (`.github/workflows/audit.yml` only greps `src/services/tradeService.ts`, `src/services/apiService.ts`, `src/lib/calculator.ts`). A native `number` used for prices in a new service/store/component is invisible to CI.
     - Hardcoded strings in template literals passed to helpers (e.g., `toastService.error('hardcoded text')`). CI's i18n checker has blind spots.
     - Dead translations — a key added to a locale file but never referenced in code.
   - Do not repeat what CI already reported (ESLint, TypeScript, `check-translations`, Conventional Commits failures).

4. **Acceptance Criteria vs. Scope Creep.**
   - Does the diff satisfy every acceptance criterion? Marked `[x]` is not enough — verify they're actually true.
   - Does the diff stay within "Out of Scope"? Flag any creep.

5. **Non-Negotiable Rules** (from CLAUDE.md / AGENTS.md):
   - **Svelte 5 Runes Only** — no `export let`, `$:`, `createEventDispatcher`, `<slot>`. Use `$props()`, `$derived()`, `$effect()`, snippets instead.
   - **No hardcoded colors** — use `var(--bg-primary)` etc. or paired classes from `src/themes.css`.
   - **Every `$effect` with listeners/subscriptions must return a cleanup function.**
   - **Decimal.js for all prices/amounts/balances** — native `number` is forbidden for financial math.
   - **Local-First Boundary** (see `docs/adr/0001-local-first-boundary.md`) — Class A data (Journal, Settings, API Keys, private notes) never leaves the device.
   - **Core code never imports server features** (`src/lib/spacetimedb/`, `src/services/cloudService.ts`) — server is optional, not core.

6. **Plain Correctness.**
   - Logic errors, silent failures, unhandled edge cases, missing boundaries (what happens when an API times out? when a balance is zero?).

7. **Sensitive Areas Flag.**
   - If the PR or its backlog item has `area: execution`, `area: security`, `area: exchange`, or `priority: P0`: flag gently as "👤 Human review recommended before merge" (no red dots, no uppercase alarms).
   - These are exactly what the dispatch pipeline intentionally excludes, because mistakes cost real money.

9. **Reconcile with the bot review.**
   - Fetch the latest bot review comment on the PR (`gh pr view <nr> --comments`), identified by the `Code Review for <sha>` marker or an `LGTM` from the review bot. If none exists yet, continue with your own findings and note that.
   - Match finding by finding: confirm what both reviews agree on, adopt bot findings that hold up, drop yours or theirs with a one-line reason when refuted. On conflict, Cachy rules (step 5) always win.
   - The reconciled list is the fix backlog for step 10 — nothing else gets fixed.

10. **Plan and apply fixes (interactive sessions only).**
    - In CI/unattended runs (bash denied, e.g. the `opencode.yml` review job) skip this step entirely — the skill stays report-only there.
    - Work on the PR's head branch in an isolated worktree. Never touch `develop`/`main`, never merge, never edit backlog files.
    - Excluded from auto-fix, report-only with the step 7 flag instead: anything in `area: execution`, `area: security`, `area: exchange`, or `priority: P0` code paths. Everything else confirmed in step 9 gets fixed.
    - Touch only files related to the findings. Before pushing, run the targeted tests covering your changes (AGENTS.md "Verification Standard: Fast & Targeted"); on failure, fix or leave the finding reported-but-unfixed — never push red.
    - Commit in English, Conventional Commits, no tool-attribution footers. Push only to the PR head branch.

11. **Post a Comment and re-trigger the bot review.**
   - Use `add_issue_comment` with this structure:
     - **Header:** `Code Review for <sha>` (short SHA is fine) — this marker lets step 2 skip if already reviewed.
     - **Verdict:** One-line summary (e.g., "Clean by CLAUDE.md rules, but acceptance criterion #2 not met").
     - **Findings:** Grouped by the checks above (Acceptance Criteria, CI-independent findings, OCR Pre-Filter, Bot Reconcile, Non-Negotiable Rules, Correctness, Sensitive Areas).
     - **Fixed & Pushed:** Which reconciled findings you fixed and pushed on the PR branch, and which you left reported-but-unfixed (with reason). Omit this section when nothing was pushed.
     - **Footer:** Friendly tone, collegial ("Looks good!" or "Worth a quick human double-check on the decimal.js usage here"). A light, humorous closing line is welcome, especially in back-and-forth threads between agents. No tool-attribution line required.
    - If the diff is clean and no backlog item exists, skip the comment entirely (no noise).
    - Only when step 10 pushed fixes: after the review comment, post a **separate** comment whose body starts with `/review`. The workflow trigger matches `startsWith('/review')`, so it must be its own comment — this asks the bot for a fresh review of the fixed state.
    - Exactly one fix cycle per run: findings from the re-triggered bot review are only reported, never fixed in the same run (the bot run itself is read-only, so this cannot loop).

## Example Comment

```
Code Review for a1b2c3d

**Verdict:** Acceptance criteria met, clean by CLAUDE.md rules.

**Acceptance Criteria:**
- ✓ Position size calculator handles fractional contracts (tested in unit tests)
- ✓ Risk window UI shows "N/A" when balance is zero
- ✓ I18n strings for both DE and EN

**CI Status:** Green.

**Non-Negotiable Rules:** All checks pass — Svelte 5 runes, no hardcoded colors, decimal.js used for all prices.

**Sensitivity Check:** `area: execution` applies here. 👤 Human review recommended before merge (the position calc is core-critical).

**Fixed & Pushed:** 2 findings fixed on this branch (missing $effect cleanup, dead i18n key); 1 sensitive finding left for human review. Re-triggered bot review with /review.

Nice work on this one — the fractional-contract edge case is easy to miss. 🎯
```

## Notes

- **Writes are scoped to step 10.** Code edits, commits, and pushes only there, only on the PR head branch. Never merge, never touch `develop`/`main`, never edit backlog files. The PR comments (step 11) are the only other writes.
- **If unsure, say so.** Better to voice uncertainty than to stay silent or invent confidence.
- **Peer collaboration.** Tone is friendly and collegial, not authoritative. If reviewing another agent's PR, greet them (e.g., "Thanks for this, @jules!").
- **Marker reuse:** If a new commit lands on an already-reviewed PR, post a new comment with an updated marker line (`Code Review for <new-sha>`) so the next review run knows something changed.
