---
description: Review open Jules pull requests against their backlog item's acceptance criteria and CLAUDE.md's rules, and post findings as a PR comment
---

Find open PRs that Jules created, review each against the backlog item it claims to close and against CLAUDE.md's non-negotiable rules, and post findings as a PR comment. This is oversight, not execution: never fix, commit, or merge anything here — only report.

## Identifying a Jules PR

**Do not filter by GitHub author.** Jules publishes PRs through the connected `mydcc` account, so `user.login` is `mydcc` for a Jules PR exactly like it is for a human-created one — filtering on it would find nothing. The only reliable marker is the **head branch name**, which Jules always prefixes with `jules-` (e.g. `jules-4456775863240942894-f4c6e19b`), confirmed directly against PR #1709.

## Steps

1. List open PRs in `mydcc/cachy-app` (`list_pull_requests`, `state=open`). Filter client-side to `head.ref` starting with `jules-`.
2. If none are found, say so briefly and stop — don't invent work.
3. For each Jules PR found, check whether a comment already exists that names its current head SHA (marker format: `Jules-Review für <sha>`). If yes, skip it — already reviewed, nothing has changed since. If no (new PR, or new commits since the last review), continue.
4. Read the PR title — it usually starts with the backlog item ID (e.g. `BUG-0076: ...`). Read that item's full file under `docs/backlog/bugs/` or `docs/backlog/features/`, especially **Acceptance criteria** and **Out of scope**.
5. Review the diff against three things:
   - **Acceptance criteria vs. scope creep.** Does the diff satisfy the item's acceptance criteria without reaching past its Out of scope section?
   - **CLAUDE.md's non-negotiable rules**: Svelte 5 runes only (no `export let`, no `$:`, no `createEventDispatcher`, no `<slot>`), `decimal.js` for every price/amount/balance (no native `number` for financial values), no hardcoded colors (only the CSS variables in `themes.css`), new UI text present in **both** German and English locales, every `$effect` that registers a listener/subscription returns a cleanup function.
   - **Plain correctness.** Logic errors, missing handling at a system boundary, anything a normal code review would flag.
6. If the PR or its backlog item has `area: execution`, `area: security`, `area: exchange`, or `priority: P0`: flag this explicitly and prominently as **"needs human review before merge"** — these are exactly the categories `dispatch-backlog.mjs` deliberately excludes from unattended dispatch, because a mistake there costs real money. Never omit this flag for an in-scope PR, even when the diff looks clean.
7. Post one summary comment per PR (`add_issue_comment`, with the standard attribution footer). Start it with the marker line `Jules-Review für <head-sha>` (short SHA is fine) so step 3 recognizes it next time. Structure: one-line verdict (clean / has findings / needs human review), then findings grouped by the three checks in step 5, then the P0/execution/security/exchange flag from step 6 if it applies.
8. Close with a short table to the user: PR number, item ID, verdict, link.

## Notes

- Read-only towards the codebase. The only write action is the PR comment itself — no commits, no pushes, no merges, no editing the backlog files.
- If you're unsure whether something is a real problem, say so in the comment rather than staying silent or inventing certainty either way.
- This is a manual command, not a scheduled routine — run it when you want a check, there's no cadence to maintain.
