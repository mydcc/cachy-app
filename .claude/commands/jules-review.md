---
description: Review open Jules pull requests against their backlog item's acceptance criteria and CLAUDE.md's rules, and post findings as a PR comment
---

Find open PRs that Jules created, review each against the backlog item it claims to close and against CLAUDE.md's non-negotiable rules, and post findings as a PR comment. This is oversight, not execution: never fix, commit, or merge anything here — only report.

## Identifying a Jules PR

**Do not filter by GitHub author.** Jules publishes PRs through the connected `mydcc` account, so `user.login` is `mydcc` for a Jules PR exactly like it is for a human-created one — filtering on it would find nothing.

**Do not filter by branch prefix either — it's inconsistent.** PR #1709's branch was `jules-4456775863240942894-f4c6e19b` (literal `jules-` prefix), but PR #1711's was `feat-0027-alert-engine-15368306375605769828` (a title-derived slug, no `jules-` anywhere). Relying on the prefix silently missed a real Jules PR the first time this command ran.

**The reliable marker is the PR body.** Every Jules-created PR ends with a fixed footer: `*PR created automatically by Jules for task [<id>](https://jules.google.com/task/<id>) started by @<user>*`. Match on that footer text (e.g. `PR created automatically by Jules for task`), not on the branch name.

## Steps

1. List open PRs in `mydcc/cachy-app` (`list_pull_requests`, `state=open`, include `body`). Filter to PRs whose body contains `PR created automatically by Jules for task`.
2. If none are found, say so briefly and stop — don't invent work.
3. For each Jules PR found, check whether a comment already exists that names its current head SHA (marker format: `Jules-Review für <sha>`). If yes, skip it — already reviewed, nothing has changed since. If no (new PR, or new commits since the last review), continue.
4. Read the PR title — it usually starts with the backlog item ID (e.g. `BUG-0076: ...`). Read that item's full file under `docs/backlog/bugs/` or `docs/backlog/features/`, especially **Acceptance criteria** and **Out of scope**.
5. Check the PR's CI status (`pull_request_read` method `get_check_runs`, and job logs for anything failing). **Do not report what CI already reports.** Jules watches its own PR and pushes follow-up commits to fix CI failures on its own — see its own intro comment on the PR ("I'll push a commit with your requested changes shortly after"). Restating ESLint output, TypeScript errors, `check-translations` failures, or Conventional-Commits failures is pure noise: Jules already sees them directly and will self-correct. At most, note in one line that CI is currently red — never enumerate what a check already enumerated.
   - **Exception — things CI does not actually check, even though a check with a similar name exists:**
     - `Decimal.js Enforcement` (`.github/workflows/audit.yml`) only greps three hard-coded files — `src/services/tradeService.ts`, `src/services/apiService.ts`, `src/lib/calculator.ts` — for `Number(`/`parseFloat(`/`toFixed(`. A native-`number` financial-value violation in any other file (a new service, a store, a Svelte component) is invisible to this check and still worth flagging.
     - `scripts/lint-i18n.js` (`i18n String Compliance`) has real blind spots — e.g. it can miss hardcoded strings inside template literals passed to helper calls like `toastService.error(...)`. If your own reading finds a hardcoded UI string that CI's own output did *not* list, that's new information — report it. If CI already listed it, don't repeat it.
     - Neither check catches a locale key that was **added but never referenced** anywhere in the diff (dead translation) — worth flagging, since nothing else will.
6. Review the diff against what CI cannot tell you:
   - **Acceptance criteria vs. scope creep.** Does the diff satisfy the item's acceptance criteria without reaching past its Out of scope section? Are checked-off acceptance criteria actually true, not just marked `[x]`?
   - **CLAUDE.md's non-negotiable rules, beyond what step 5's exceptions already cover**: Svelte 5 runes only (no `export let`, no `$:`, no `createEventDispatcher`, no `<slot>`), no hardcoded colors (only the CSS variables in `themes.css`), every `$effect` that registers a listener/subscription returns a cleanup function.
   - **Plain correctness.** Logic errors, missing handling at a system boundary (a silently swallowed exception, an unhandled edge case), anything a normal code review would flag that no CI check catches.
7. If the PR or its backlog item has `area: execution`, `area: security`, `area: exchange`, or `priority: P0`: flag this explicitly and prominently as **"needs human review before merge"** — these are exactly the categories `dispatch-backlog.mjs` deliberately excludes from unattended dispatch, because a mistake there costs real money. Never omit this flag for an in-scope PR, even when the diff looks clean.
8. Post one summary comment per PR (`add_issue_comment`, with the standard attribution footer) — **only if you have something to say that CI doesn't already cover.** If the diff is clean by every measure in steps 5-7, a short "no findings" comment is still useful (it's the record that a review happened); but if the only things you found are CI-duplicate, skip the comment entirely — CI and Jules's own self-correction already have it covered. Start the comment with the marker line `Jules-Review für <head-sha>` (short SHA is fine) so step 3 recognizes it next time. Structure: one-line verdict, then findings grouped by the checks in step 6, then the P0/execution/security/exchange flag from step 7 if it applies.
9. Close with a short table to the user: PR number, item ID, verdict, link.

## Notes

- Read-only towards the codebase. The only write action is the PR comment itself — no commits, no pushes, no merges, no editing the backlog files.
- If you're unsure whether something is a real problem, say so in the comment rather than staying silent or inventing certainty either way.
- This is a manual command, not a scheduled routine — run it when you want a check, there's no cadence to maintain.
