---
name: backlog-groom
description: Promote qualified `specced` backlog items to `ready`, then interactively resolve blocked bugs with the user so they can be handed off (e.g. to Google Jules)
---

Groom the backlog in two phases: first a silent auto-promote pass, then an interactive discussion pass for bugs that are still blocked. The point of the second phase is to turn "blocked" into "ready" by actually deciding the open question with the user, not just reporting that it exists.

## Phase 1 — Auto-promote (silent, no discussion)

0. **Workspace Hygiene:** Before starting, ensure your git workspace is clean (`git status`) and you are on the `develop` branch (`git checkout develop`), or that you are using an isolated git worktree. This prevents inheriting broken state from parallel agents.
1. Read `docs/backlog/INDEX.md` to list every item with `status: specced`.
2. For each `specced` item, read the file itself — front matter and body, not just the title — and check the same gate `docs/backlog/README.md` describes for "ready":
   - **`depends_on`**: every listed ID must be `status: done`. If any dependency is not done, the item stays `specced` — note which dependency blocks it.
   - **`adr`**: if the field is `required`, the referenced ADR must exist under `docs/adr/`. If it is `required` and no ADR exists, the item stays `specced`.
   - **Open questions**: the body must not contain unresolved questions, `TODO`s, or a "needs decision" note blocking the work. If it does, the item stays `specced`.
   - **Acceptance criteria and Out of scope**: both sections must be present and concrete (see `docs/backlog/README.md`, "Body"). A `specced` item missing either is not actually spec-complete yet — stays `specced`.
3. For every item that clears all four checks, edit its front matter: set `status: ready`. Do not touch anything else in the file — not `priority`, not `milestone`, not the body.
4. Run `npm run backlog:index` to regenerate `docs/backlog/INDEX.md`.
5. Report a table: item ID, old status → new status, and the reason for each item that was promoted or held back.

## Phase 2 — Interactive bug triage (discussion, one bug at a time)

This phase only looks at items still `specced` after Phase 1 **with `type: bug`** — that's the set the user wants to hand off for execution (e.g. to Google Jules), so bugs get priority over features/ideas here.

6. From the Phase 1 "held back" list, pick out the bugs and list them briefly (ID, title, the specific thing blocking them — unmet dependency, missing ADR, open question, or missing AC/Out-of-scope section). Ask the user which ones they want to work through now; don't assume "all of them."
7. For each bug the user picks, go one at a time:
   - Show the blocking passage verbatim (the actual "Fix"/"Open questions" text, or the missing section) so the user isn't re-deriving context you already have.
   - Discuss it with the user like a real triage conversation — trade-offs, not a form to fill in. Wait for their actual decision; do not decide on their behalf and do not invent an answer to make the gate pass.
   - Once they decide, edit the bug file to fold the decision in: update the `Fix`/`Proposal` section to state the chosen approach (not just "not decided yet"), resolve or remove the specific open question that's now answered, and fill in Acceptance criteria / Out of scope if either was the gap. Keep everything else in the file untouched.
   - Re-run the Phase 1 gate check against the edited file. If it now passes, set `status: ready`. If the discussion surfaced that the item needs to be split or is bigger than it looked, say so instead of forcing a promotion.
8. After each bug (or a batch, if the user prefers to burn through several before checking in), run `npm run backlog:index` and show the updated status.
9. Close with a summary table of everything touched in this phase: ID, old → new status, and the decision that unblocked it (one line, e.g. "device-key mismatch → option 1, canary detection").

## Git

Never commit, push, or open a pull request as part of this command, in either phase — that decision belongs to the user. If a stop-hook or session policy forces a commit anyway, say so explicitly before doing it and keep the commit scoped to the backlog files this command touched — don't let it turn into an unannounced PR. If a PR gets created as a side effect of environment policy, tell the user plainly that it happened and why, rather than treating it as part of the grooming task.

## Notes

- Only touch `specced` items. Never move `idea` items to `ready` directly — an idea has to become `specced` first.
- If `npm run backlog:check` was already failing before you started (stale index, invalid front matter unrelated to this grooming pass), say so instead of silently fixing unrelated items.
- Phase 2 is opt-in per item and per session — running `/backlog-groom` should never feel like it silently rewrote a bug's proposed fix. If the user just wants Phase 1, they can say so and Phase 2 is skipped.
