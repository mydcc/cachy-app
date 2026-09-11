---
id: BUG-0354
title: The backup-restore rejection message is hardcoded English
type: bug
status: done
shipped: 1.6.0-beta.235
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
estimate: 1
size: XS
assignee: opencode
branch: fix/bug-0354-backlog-tracking
---

# BUG-0354 — The backup-restore rejection message is hardcoded English

## Problem

When a restore is refused, `backupService.ts` reports it with a string built in
code:

```
Backup restore rejected: Invalid section(s): settings. No changes were applied.
```

Every other user-facing message in the app goes through `src/locales/`. A
German user restoring a damaged backup gets English at the one moment they most
need to understand what happened — and "No changes were applied" is exactly the
reassurance that has to land.

Found while implementing [`FEAT-0333`](../features/FEAT-0333-account-storage-shape.md),
which routes a new refusal case into this same message. The behaviour is
correct; only the presentation is untranslated.

## Acceptance criteria

- [x] The rejection message comes from `src/locales/`, German and English
- [x] The rejected section names remain legible — a raw key list is not a
      translation, so either translate the section names or keep them
      verbatim deliberately
- [x] The "no changes were applied" reassurance survives translation

Fixed in #2637 (translation key `app.backupRejected` + `messageParams`), with the
interpolation follow-up in #2680. This PR only flips the backlog tracking.

## Out of scope

- **Changing what gets rejected.** This is a presentation fix.

## Links

- `src/services/backupService.ts` — the message
- [`FEAT-0333`](../features/FEAT-0333-account-storage-shape.md) — where it was found
