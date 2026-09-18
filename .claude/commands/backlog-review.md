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
- This command file itself

After the first review, subsequent reviews hit the cache → ~60-80% token savings. The cache is valid for 5 minutes; if you run multiple reviews in quick succession, the savings compound.

When to use Haiku 4.5 instead: route by diff size — under ~100 changed lines use Haiku 4.5, above that Sonnet 5 (the skill states the exact rule).

## Scope: Which PRs to Review

Run this command in three ways:

1. **All open PRs** (default) — review every open PR against its backlog item if one is linked
2. **A specific PR** (pass `--pr <number>`) — review only PR #N
3. **PRs by a specific agent** (pass `--author <login>`) — review open PRs from a named author (e.g. `--author jules`)

If you're an agent reviewing your own work: use `--author <your-login>` to focus on your PRs. If you're a human or a different agent reviewing: use the default (all) or `--pr` for a specific one.

## Steps

This command executes the `backlog-review` skill — triage gates, all review steps, the severity scale, the chat-first confirmation, the fix + push rules, and the comment format live in `.agents/skills/backlog-review/SKILL.md` and are normative. Do not duplicate them here.

- Run the skill end to end for each PR in scope: triage, findings with severity labels, bot reconcile, per-finding confirmation in chat (never self-fix on silence), fix + push of confirmed findings on the PR branch (interactive sessions only), review comment only after the fixes are pushed, `/review` re-trigger after pushes.
- Invocation: `/backlog-review [--pr N] [--author login]`.

## Notes

- **Writes only via the skill.** Code edits, commits, and pushes only as the skill prescribes, only on the PR head branch. Never merge, never touch `develop`/`main`, never edit backlog files. The PR comments are the only other writes.
- **If unsure, say so.** Better to voice uncertainty than to stay silent or invent confidence.
- **Peer collaboration.** Tone is friendly and collegial, not authoritative. If reviewing another agent's PR, greet them (e.g., "Thanks for this, @jules!").
- **Marker reuse:** If a new commit lands on an already-reviewed PR, post a new comment with an updated marker line (`Code Review for <new-sha>`) so the next review run knows something changed.
