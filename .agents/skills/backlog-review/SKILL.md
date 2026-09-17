---
name: backlog-review
description: Review open PRs against backlog acceptance criteria and Cachy rules, reconcile with bot review, fix findings, commit, push, and re-trigger bot review
---

Review open PRs in `mydcc/cachy-app` against their backlog item (if linked) and Cachy's non-negotiable rules (CLAUDE.md, AGENTS.md). This is a binding pipeline — review, reconcile, then fix: list all findings first, reconcile them with the bot review, present a fix plan, fix every confirmed finding, commit, push, comment, and re-trigger the bot review — never merge. There is no report-only mode: a run is complete only when every finding is fixed and pushed or the run aborted with its blocker stated.

**This command works for any agent** (Jules, Claude Code, Cursor, Codex, Antigravity, etc.), not Jules-specific. It uses backlog item metadata to structure the review.

## Language (non-negotiable)

- **Chat with the user: German.** Every message addressed to the user — status updates, questions, summaries, explanations, triage notes — is written in German. The user communicates in German; answering in English is a rule violation, not a style choice. This applies to all agents running this skill, with no exceptions.
- **Artifacts stay English.** PR review comments (step 11), commit messages, code, identifiers, and technical terms remain in English per the repo's Commits & Branches rule. Never translate code identifiers or technical terms into German — only the conversation around them is German.
- **Chat summary ends with a before/after table.** After step 11, the German chat summary closes with a table listing every fixed finding: finding (severity) | before | after. No finding is omitted from this table.

## Model & Token Efficiency

**Recommended Model:** Claude Sonnet 5 / Gemini Pro (best cost/quality balance for code review)

**Token Optimization via Prompt Caching:** This command caches the stable review rules:
- `CLAUDE.md` (non-negotiable rules: Svelte 5, decimal.js, theming, Local-First)
- `AGENTS.md` (review standard checklist)
- This command file itself (process and example)

After the first review, subsequent reviews hit the cache → ~60-80% token savings. The cache is valid for 5 minutes; if you run multiple reviews in quick succession, the savings compound.

When to use Haiku 4.5 / Flash instead: route by diff size — under ~100 changed lines (`gh pr view <nr> --json additions,deletions`) use Haiku 4.5 / Flash, above that Sonnet 5 / Gemini Pro.

## Scope: Which PRs to Review

Run this command in three ways:

1. **All open PRs** (default) — review every open PR against its backlog item if one is linked
2. **A specific PR** (pass `--pr <number>`) — review only PR #N
3. **PRs by a specific agent** (pass `--author <login>`) — review open PRs from a named author (e.g. `--author jules`)

If you're an agent reviewing your own work: use `--author <your-login>` to focus on your PRs. If you're a human or a different agent reviewing: use the default (all) or `--pr` for a specific one.

## Steps

**Finding severity (labels every finding in steps 3–6):** `CRITICAL` = block merge, `HIGH` = fix before merge, `MEDIUM` = consider, `LOW` = optional — same scale as the AGENTS.md Code Review Standard.

0. **Workspace Hygiene:** Before starting, ensure your git workspace is clean (`git status`) and you are on the `develop` branch (`git checkout develop`), or that you are using an isolated git worktree. This prevents inheriting broken state from parallel agents.

**Triage (before step 1 — cheapest checks first, any hit ends the run with no PR comment):**
- Get the changed files (`gh pr view <nr> --json files --jq '.files.[].path'`). Nothing under `src/*`, `scripts/*`, or `technicals-wasm/*` → end the run (same gate as the `opencode.yml` changes job: docs, configs, and lockfiles get no agent review).
- PR is draft → end the run with a one-line note to the invoker, no PR comment.
- A `Code Review for <sha>` marker matching the current HEAD SHA is already posted (see step 2) → end the run, no PR comment.

1. **OCR delegation pre-filter (best-effort, read-only).**
   - Run Alibaba `open-code-review` in delegation mode — deterministic file selection + rule matching, no LLM key needed, produces no verdict of its own:
     ```bash
     npx -y @alibaba-group/open-code-review delegate preview --from origin/develop --to <pr-head-sha>
     npx -y @alibaba-group/open-code-review delegate rule <reviewable-path> [<reviewable-path>...]
     ```
     Single commit: `delegate preview -c <sha>`; uncommitted local changes: bare `delegate preview`.
   - Treat the output as input only: the reviewable-file list scopes steps 2–10, the rule groups are hints. Cachy rules (step 5) always win on conflict; drop OCR-only Low/style nits.
   - **Manually review everything OCR excluded** — it excludes test files via `default_path` (proven gap on PR #3419). Excluded ≠ approved.
   - Focus your own depth on OCR-excluded files (tests!) and the Cachy-specific checks (steps 4–5); for generic correctness (step 6) review only the delta to the bot review instead of everything twice.
   - If `ocr` or bash is unavailable (e.g. CI review runner with bash disabled) or the command fails: skip silently and continue — never block the review on this step.

2. **Identify the backlog item.**
   - **Already reviewed?** Search the PR comments for a `Code Review for <sha>` marker matching the current HEAD SHA (`gh pr view <nr> --comments --jq '.[].body'`). On a match, end the run immediately with "already reviewed at <sha>" — no new review, no comment. Steps 9 and 11 reuse this lookup for the bot comment.
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
   - If the bot review already covers an area with no findings, only check commits newer than its marker SHA — don't re-review clean files.

7. **Sensitive Areas Flag.**
   - If the PR or its backlog item has `area: execution`, `area: security`, `area: exchange`, or `priority: P0`: flag gently as "👤 Human review recommended before merge" (no red dots, no uppercase alarms).
   - These are exactly what the dispatch pipeline intentionally excludes, because mistakes cost real money.

8. **Lifecycle Hygiene.**
   - Is the item's claim consistent? An `in-progress` item needs `assignee` + branch name (missing `assignee` also fails `npm run backlog:check`).
   - If the PR merges the work: was cleanup done — worktree removed, branch deletable, item moved to `done` (or a state note left when abandoning)? Gently flag leftovers per "Agent Lifecycle" in `AGENTS.md`.

9. **Reconcile with the bot review.**
   - Fetch the latest bot review comment on the PR (`gh pr view <nr> --comments`), identified by the `Code Review for <sha>` marker or an `LGTM` from the review bot. If none exists yet, continue with your own findings and note that.
   - Match finding by finding: confirm what both reviews agree on, adopt bot findings that hold up, drop yours or theirs with a one-line reason when refuted. On conflict, Cachy rules (step 5) always win. Keep findings of every severity — including `LOW` — in the fix backlog; nothing is dropped for being minor.
   - The reconciled list is the fix backlog for step 10 — nothing else gets fixed.

10. **Plan and apply fixes (always — no report-only).**
    - In CI/unattended runs (bash denied, e.g. the `opencode.yml` review job) skip this step entirely — the skill stays report-only there.
    - Work on the PR's head branch in an isolated worktree. Never touch `develop`/`main`, never merge, never edit backlog files.
    - Fix every confirmed finding from step 9, in severity order `CRITICAL` → `HIGH` → `MEDIUM` → `LOW`. No exclusions: sensitive code paths (`area: execution`, `area: security`, `area: exchange`, `priority: P0`) are fixed like everything else; the step 7 gentle human-review note stays as an info line but never blocks a fix.
    - Present the fix plan in chat before applying it, then apply it.
    - Touch only files related to the findings. Before pushing, run the targeted tests covering your changes (AGENTS.md "Verification Standard: Fast & Targeted"); on failure, fix or leave the finding reported-but-unfixed — never push red.
    - Push only when CI is green on the PR branch — on red, stay report-only and say so.
    - Before pushing, `git fetch` the PR branch and rebase your fix commit(s) onto it; on conflict abort the push and report — never force-push someone else's branch.
    - One commit per run (squash-merge flattens history anyway). Commit in English, Conventional Commits, no tool-attribution footers. Push only to the PR head branch.

11. **Post a Comment and re-trigger the bot review.**
   - **GitHub Actions / CI Agent Note:** When running inside GitHub Actions as an automated workflow or bot (where the action runner automatically captures and publishes your final response, such as `opencode.yml`), do NOT run `gh pr comment` or `add_issue_comment` yourself — that creates duplicated comments under two bot identities. Return the complete review markdown directly as your final message.
   - For interactive sessions (CLI, local pairing) where no platform wrapper automatically publishes output, use `add_issue_comment` or post the comment with this structure:
     - **Header:** `Code Review for <sha>` (short SHA is fine) — this marker lets step 2 skip if already reviewed.
     - **Verdict:** One-line summary (e.g., "Clean by CLAUDE.md rules, but acceptance criterion #2 not met").
     - **Findings:** Grouped by the checks above (Acceptance Criteria, CI-independent findings, OCR Pre-Filter, Bot Reconcile, Non-Negotiable Rules, Correctness, Sensitive Areas). Tag each finding with its severity, e.g. `- [HIGH] Missing $effect cleanup in …`.
      - **Fixed & Pushed:** Which reconciled findings you fixed and pushed on the PR branch. Nothing is left unfixed — if a finding could not be fixed, the run is incomplete and the blocker is stated here instead. Omit this section when nothing was pushed.
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

**Fixed & Pushed:** 3 findings fixed on this branch (missing $effect cleanup, dead i18n key, stale liveSummary). Re-triggered bot review with /review.

Nice work on this one — the fractional-contract edge case is easy to miss. 🎯
```

## Notes

- **Writes are scoped to step 10.** Code edits, commits, and pushes only there, only on the PR head branch. Never merge, never touch `develop`/`main`, never edit backlog files. The PR comments (step 11) are the only other writes.
- **If unsure, say so.** Better to voice uncertainty than to stay silent or invent confidence.
- **Peer collaboration.** Tone is friendly and collegial, not authoritative. If reviewing another agent's PR, greet them (e.g., "Thanks for this, @jules!").
- **Marker reuse:** If a new commit lands on an already-reviewed PR, post a new comment with an updated marker line (`Code Review for <new-sha>`) so the next review run knows something changed.
