---
description: Promote qualified `specced` backlog items to `ready` and refresh the index
---

Groom the backlog: find `specced` items that are actually ready to be picked up, promote them, and leave everything else untouched.

## Steps

1. Read `docs/backlog/INDEX.md` to list every item with `status: specced`.
2. For each `specced` item, read the file itself — front matter and body, not just the title — and check the same gate `docs/backlog/README.md` describes for "ready":
   - **`depends_on`**: every listed ID must be `status: done`. If any dependency is not done, the item stays `specced` — say which dependency blocks it.
   - **`adr`**: if the field is `required`, the referenced ADR must exist under `docs/adr/`. If it is `required` and no ADR exists, the item stays `specced`.
   - **Open questions**: the body must not contain unresolved questions, `TODO`s, or a "needs decision" note blocking the work. If it does, the item stays `specced`.
   - **Acceptance criteria and Out of scope**: both sections must be present and concrete (see `docs/backlog/README.md`, "Body"). A `specced` item missing either is not actually spec-complete yet — stays `specced`.
3. For every item that clears all four checks, edit its front matter: set `status: ready`. Do not touch anything else in the file — not `priority`, not `milestone`, not the body.
4. Run `npm run backlog:index` to regenerate `docs/backlog/INDEX.md`.
5. Report a summary as a table: item ID, old status → new status, and the reason for each item that was promoted or held back. Do not commit or push — that decision is left to the user after they've seen the report.

## Notes

- Only touch `specced` items. Never move `idea` items to `ready` directly — an idea has to become `specced` first.
- If `npm run backlog:check` was already failing before you started (stale index, invalid front matter unrelated to this grooming pass), say so instead of silently fixing unrelated items.
