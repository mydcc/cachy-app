---
id: BUG-0283
title: Unencrypted backup exports contain plaintext exchange credentials
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
---

# BUG-0283 — Unencrypted backup exports contain plaintext exchange credentials

## Symptom

`backupService.getBackupPayload()` dumps the settings blob verbatim into a
downloadable JSON file unless the user supplies a password. Because exchange API
keys currently sit in that blob unencrypted by default (see
[`FEAT-0200`](../features/FEAT-0200-encrypt-localstorage-secrets-at-rest.md)),
"export my journal backup" writes live trading credentials to disk/cloud drives.

## Evidence

**Derived** — from reading `src/services/backupService.ts:80–110` together with
the settings-store serialization (`settings.svelte.ts` `toJSON`, which emits
`apiKeys` unless master-password mode is active). No export was captured at
runtime; the payload composition follows directly from the code.

## Cause

The backup path predates the observation that the settings blob carries secrets;
it treats the whole blob as journal-grade data.

## Fix

Unencrypted exports exclude credential fields (`apiKeys`, `encryptedApiKeys`)
by default. If credentials are present and no password was given, either refuse
with a clear message or require an explicit opt-in per export. Encrypted
(password) exports may include them as today. Independent of, but reinforced by,
[`FEAT-0200`](../features/FEAT-0200-encrypt-localstorage-secrets-at-rest.md):
once keys are encrypted at rest, this item additionally guards the ciphertext.

## Acceptance criteria

- [x] An unencrypted export contains no `apiKeys`/`encryptedApiKeys` data,
      proven by a test on `getBackupPayload()` output — failing before the fix
- [x] A password-encrypted export round-trips credentials exactly (test)
- [x] The UI states plainly what an export contains before download
      (DE + EN strings)

## Out of scope

Encrypting secrets at rest ([`FEAT-0200`](../features/FEAT-0200-encrypt-localstorage-secrets-at-rest.md)).
Restore-path validation ([`BUG-0284`](BUG-0284-backup-restore-unvalidated-writes.md)).

## Shipped

`1.6.0-beta.111` — squash-merged from PR #2229 (commit `a651c3b1`). Unencrypted
exports run through `sanitizeSettingsForUnencryptedExport`; the DE/EN
export-content notice ships as `app.backupEncryptQuestion`. Tests:
`src/services/backupService.test.ts`.

## Links

- `src/services/backupService.ts`
- Security audit 2026-08-23, finding "unencrypted backups contain secrets and full journal" (Medium)
