---
id: BUG-0622
title: autoBackupService overwrites healthy snapshot with null on local store corruption
type: bug
status: done
priority: P0
milestone: none
editions: [community, pro, private]
area: persistence
data_class: A
adr: none
depends_on: []
---

# BUG-0622 — autoBackupService overwrites healthy snapshot with null on local store corruption

## Symptom

A single corrupted `localStorage` store (e.g. invalid journal JSON after a
crashed write) causes the automatic OPFS snapshot to be overwritten with a
payload where that store is permanently `null`. The previously healthy
snapshot — the exact recovery copy the user would need — is destroyed by the
backup itself. Irreversible Class A data loss.

## Evidence

Derived, reconciled 2026-10-05 against `origin/develop` (the #3860 audit
draft described the same mechanism; re-verified, still present).

1. `getBackupPayload` in `src/services/backupService.ts` maps corrupt stores
   to `null` via `getValidatedData` (invalid JSON → `null`, "Skipping").
   `null` therefore means *either* "store empty" *or* "store corrupt" —
   the distinction is lost in the payload.
2. `saveOpfsSnapshot` in `src/services/autoBackupService.svelte.ts` only
   guards the completely-empty case:

```typescript
const meta = extractSnapshotMeta(payload);
const hasAnyData = meta.entryCount > 0 || meta.presetCount > 0 || meta.hasSettings;
```

If only the journal is corrupt, `hasAnyData` stays true via settings, and the
existing OPFS file is truncated and rewritten with `journal: null`.

## Cause

The emptiness guard does not distinguish "no data anywhere" from "one store
failed validation while others are intact".

## Fix

In `saveOpfsSnapshot`, before the truncate-write: compare each validated
payload field against its raw `localStorage` bytes. If raw bytes exist but
the payload field is `null`, that store failed validation → abort the
snapshot (`return false`) and keep the previous healthy file. Applies to all
validated stores (settings, presets, journal, tradeState, quizState,
riskLimits, paperTrading, orderAudit); theme is an unvalidated passthrough
and needs no check.

## Acceptance criteria

- [ ] A test reproduces the defect and fails without the fix (healthy OPFS
      snapshot + corrupt local journal → snapshot overwritten with null journal)
- [ ] The test passes with the fix (write skipped, previous snapshot intact)
- [ ] Healthy local state still snapshots normally (existing test stays green)

## Links

- Supersedes the BUG-0251 draft from PR #3860 (closed unmerged; IDs 0250–0252
  were reassigned on `develop` in the meantime)
- Branch: `fix/persistence-restore-autobackup`

## What shipped

Shipped in 1.6.0-beta.378 (PR #3864, squash-merge 1874d1def).
