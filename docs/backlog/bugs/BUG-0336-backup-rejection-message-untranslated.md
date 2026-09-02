---
id: BUG-0336
title: The backup-restore rejection message is hardcoded English
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
estimate: 1
size: XS
---

# BUG-0336 — The backup-restore rejection message is hardcoded English

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

- [ ] The rejection message comes from `src/locales/`, German and English
- [ ] The rejected section names remain legible — a raw key list is not a
      translation, so either translate the section names or keep them
      verbatim deliberately
- [ ] The "no changes were applied" reassurance survives translation

## Out of scope

- **Changing what gets rejected.** This is a presentation fix.

## Links

- `src/services/backupService.ts` — the message
- [`FEAT-0333`](../features/FEAT-0333-account-storage-shape.md) — where it was found
