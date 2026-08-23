---
id: BUG-0284
title: Backup restore writes unvalidated strings straight into localStorage
type: bug
status: ready
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
---

# BUG-0284 — Backup restore writes unvalidated strings straight into localStorage

## Symptom

`backupService.restoreFromBackup()` writes fields of an imported file
(`data.settings`, `data.journal`, …) directly into localStorage keys. JSON
validity checking exists only on the *create* path. A crafted or corrupted
backup can therefore plant arbitrary state: a redirected host setting, flipped
consent/disclaimer flags, poisoned presets.

## Evidence

**Derived** — from reading `src/services/backupService.ts:225–252`. User-initiated
(the victim must import the file), which bounds impact, but "restore" currently
trusts file content less strictly than "create" does.

## Cause

The restore path predates the validation discipline applied elsewhere; it treats
imported strings as trusted because they came from "a backup".

## Fix

Validate every field before writing: each stored value must parse as JSON and
pass a light schema sanity check appropriate to its key (e.g. consent flags are
booleans, hosts match an allowlist shape). Only reload after all validations
pass; report precisely which sections were rejected instead of importing partially
poisoned state.

## Acceptance criteria

- [ ] A test restores a backup whose `settings` field is not valid JSON / fails
      schema sanity and asserts nothing was written for that section and the UI
      reports the rejection — failing before the fix
- [ ] A legitimate full backup still restores completely (round-trip test)
- [ ] Partial rejection never leaves a half-imported mix of old and new state
      without an explicit user-visible result

## Out of scope

Full Zod schemas for every store's persisted shape — light structural checks only;
deeper typing is each store's own concern. Credential handling inside backups
([`BUG-0283`](BUG-0283-backup-export-plaintext-credentials.md)).

## Links

- `src/services/backupService.ts`
- Security audit 2026-08-23, finding "restore writes unvalidated strings into storage keys" (Medium)
