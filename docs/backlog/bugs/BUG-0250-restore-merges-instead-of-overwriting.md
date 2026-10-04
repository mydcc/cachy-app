---
id: BUG-0250
title: restoreFromBackup merges missing fields instead of overwriting
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: persistence
data_class: A
adr: none
depends_on: []
---

# BUG-0250: restoreFromBackup merges missing fields instead of overwriting

## Context

In `src/services/backupService.ts`, the function `restoreFromBackup` takes a JSON string, decodes it, and selectively writes its fields back to `localStorage`.

```typescript
    // --- Restore to localStorage ---
    if (data.settings) {
      localStorage.setItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY, data.settings);
    }
    if (data.presets) {
      localStorage.setItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY, data.presets);
    }
```

## Evidence (Derived)

Derived, from reading the code in `src/services/backupService.ts`, lines 231-246.

If a field is missing or `null` in the backup JSON (e.g. `data.tradeState` is undefined because the user created the backup before using the feature, or a corruption caused it to be null), the `if (data.tradeState)` condition evaluates to false.

Consequently, `restoreFromBackup` does not remove or overwrite the existing `localStorage` data for that key. Instead of restoring the application to the exact state it was in when the backup was made, it merges the backup into the current state. If a user tries to restore a backup to fix a corrupted local `tradeState`, the corrupted state remains in `localStorage` untouched.

## Expected Behavior

`restoreFromBackup` should fully replace the current state with the backup state. If a field like `tradeState` is absent in the backup, it should be deleted from `localStorage` during the restore process.

## Suggested Test Case

1. Set `tradeState` in `localStorage` to a valid value.
2. Call `restoreFromBackup` with a backup JSON that does not contain a `tradeState` field.
3. Assert that `tradeState` is removed from `localStorage` after the restore.
