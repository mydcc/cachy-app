---
id: BUG-0621
title: restoreFromBackup merges missing fields instead of overwriting
type: bug
status: in-progress
priority: P1
milestone: none
editions: [community, pro, private]
area: persistence
data_class: A
adr: none
depends_on: []
assignee: opencode
---

# BUG-0621 — restoreFromBackup merges missing fields instead of overwriting

## Symptom

A user restores a backup to recover from corrupted local state, but the
corrupted values survive the restore: any field absent from the backup JSON
is left untouched in `localStorage` instead of being cleared.

## Evidence

Derived, reconciled 2026-10-05 against `origin/develop` (the #3860 audit
draft described the same mechanism; re-verified, still present; the sibling
finding BUG-0252 from that audit was stale and is dropped).

In `src/services/backupService.ts`, `restoreFromBackup` only writes fields
that are present:

```typescript
if (data.settings) {
  safeLocalStorage.setItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY, data.settings);
}
if (data.presets) { ... }
// ... same pattern for journal, tradeState, theme, quizState,
// riskLimits, paperTrading, orderAudit
```

And `validateBackupSections` (same file) only validates *present* sections —
`null`/`undefined` fields are skipped, so a backup missing `tradeState`
passes validation and then merges instead of replacing.

## Cause

No removal path: absent backup fields never translate to `removeItem`, so
restore is merge, not replace.

## Fix

Version-gated full replace in `restoreFromBackup` (reconciled vs. the #3860
draft, which proposed unconditional deletion): when
`backup.backupVersion >= BACKUP_VERSION`, absent fields are removed from
`localStorage` (the backup is complete by the current schema). Older backups
may predate fields, so they keep merge behavior and only write present
fields — restoring a pre-feature backup must not wipe newer stores.

## Acceptance criteria

- [ ] A test reproduces the defect and fails without the fix (current-version
      backup without `tradeState` leaves stale `tradeState` behind)
- [ ] The test passes with the fix (`tradeState` removed, present fields replaced)
- [ ] A pre-`BACKUP_VERSION` backup without `tradeState` keeps merge behavior
- [ ] The existing full-restore test still passes

## Links

- Supersedes the BUG-0250 draft from PR #3860 (closed unmerged; IDs 0250–0252
  were reassigned on `develop` in the meantime)
- Branch: `fix/persistence-restore-autobackup`
