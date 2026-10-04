---
id: BUG-0251
title: autoBackupService overwrites healthy snapshot with null on local store corruption
type: bug
status: specced
priority: P0
milestone: none
editions: [community, pro, private]
area: persistence
data_class: A
adr: none
depends_on: []
---

# BUG-0251: autoBackupService overwrites healthy snapshot with null on local store corruption

## Context

The `autoBackupService.svelte.ts` listens to `localStorage` changes and automatically saves OPFS snapshots using `getBackupPayload` from `backupService.ts`.

## Evidence (Derived)

Derived, from reading the code in `src/services/backupService.ts` and `src/services/autoBackupService.svelte.ts`.

1. In `src/services/backupService.ts`, `getBackupPayload` calls `getValidatedData(key)` to parse each `localStorage` item. If the local data is corrupt (e.g. invalid JSON), `getValidatedData` catches the exception and returns `null`, intentionally skipping the garbage.
2. In `src/services/autoBackupService.svelte.ts`, `saveOpfsSnapshot` checks if the backup payload has any valid data to prevent overwriting a healthy snapshot with a completely empty one:
   ```typescript
   const meta = extractSnapshotMeta(payload);
   const hasAnyData = meta.entryCount > 0 || meta.presetCount > 0 || meta.hasSettings;
   ```
3. If **only one** store (e.g. the journal) becomes corrupted, `getValidatedData` sets `payload.data.journal` to `null`. However, `hasAnyData` remains true because other stores (like settings) are still intact.
4. `saveOpfsSnapshot` then proceeds to overwrite the existing OPFS file (using `createWritable()` with truncate) with this new payload.

This causes irreversible data loss. The previously healthy OPFS snapshot (which contained the intact journal) is deleted and replaced with a backup where the journal is permanently `null`.

## Expected Behavior

`autoBackupService` must not overwrite an existing OPFS snapshot if any critical local store fails validation. If a store is unparseable but historically existed, the backup process should either abort or retain the healthy version of that specific store from the previous snapshot.

## Suggested Test Case

1. Initialize OPFS with a healthy backup containing a valid journal and valid settings.
2. Corrupt the local journal by setting `localStorage.setItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY, "invalid json")`.
3. Trigger `saveOpfsSnapshot()`.
4. Assert that the OPFS snapshot was not overwritten, or that the resulting snapshot still contains the healthy journal from before the corruption.
