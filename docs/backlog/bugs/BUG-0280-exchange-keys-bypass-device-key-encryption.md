---
id: BUG-0280
title: Exchange API keys bypass the device-key encryption and sit in localStorage in plaintext
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
size: S
estimate: 3
---

# BUG-0280 — Exchange API keys bypass the device-key encryption and sit in localStorage in plaintext

## Symptom

Bitunix/Bitget API keys and secrets are persisted to `localStorage`
unencrypted, although Cachy already ships a working AES-GCM device-key
encryption path used for its other secrets. Any XSS on the page, hostile
browser extension, shared computer, disk-forensic read of the browser profile,
or unencrypted backup export yields live trading credentials with real-money
authority (order placement included).

## Evidence

**Derived** from a static identity/security audit of `develop` (2026-08-23,
commit near `b82f552e`). No runtime reproduction was performed; the fix needs
a reproducing test first.

- `applyFieldEncryption` in `src/stores/settings/secretsLoader.ts` (~L247)
  encrypts only the fields listed in `SENSITIVE_KEYS`;
  `apiKeys.bitunix` / `apiKeys.bitget` are absent from that list.
- `toJSON()` in `src/stores/settings.svelte.ts` (~L1536–1541) emits
  `$state.snapshot(this.apiKeys)` verbatim whenever `isEncrypted === false`,
  and `save()` (~L1448–1504) persists that JSON via
  `StorageHelper.safeSave`.
- The sole writer of the encrypted variant is `setMasterPassword()`
  (~L1112); without a master password the keys are never encrypted.
- `backupService.getBackupPayload` dumps raw localStorage strings, so an
  unprotected export contains the plaintext credentials too.

## Cause

The `SENSITIVE_KEYS` field list predates or omits the exchange-key fields, so
the otherwise-sound device-key encryption path never sees them.

## Fix

- Route `bitunix`/`bitget` credentials through the existing device-key
  encryption path on every save (same treatment as the current
  `SENSITIVE_KEYS` entries).
- One-time migration: encrypt legacy plaintext blobs on load instead of
  discarding or re-prompting.
- `toJSON()` always emits empty strings for key/secret fields; decryption
  happens only at point of use (signed request construction).
- Exclude plaintext exchange credentials from backup payloads unless the
  user has chosen a protected (master-password/encrypted) backup.

## Acceptance criteria

- [x] A test reproduces the defect: saving `apiKeys` without a master
      password produces plaintext in the persisted JSON, and fails before
      the fix
- [x] After the fix, the same save produces ciphertext and `toJSON()` never
      contains key/secret material
- [x] Legacy plaintext entries are migrated to encrypted form on load
- [x] A backup payload contains no plaintext exchange credentials
      (covered by the BUG-0283 `sanitizeSettingsForUnencryptedExport` tests)
- [x] `npm run check` and the affected tests pass

## Priority note

Per the backlog README's own P0 definition ("a credential that can leak")
this borders on P0; it is triaged P1 consistent with BUG-0235. A human may
raise it during grooming.

## Shipped

`1.6.0-beta.120` — squash-merged from PR #2243 (commit `9056d6a6`). Exchange
keys are routed through the device-key encryption with one-time legacy
migration on load; the backup-export half is covered by BUG-0283's
`sanitizeSettingsForUnencryptedExport` tests.

## Links

- [FEAT-0200](../features/FEAT-0200-encrypt-localstorage-secrets-at-rest.md)
  — broader encrypt-at-rest design (session-secret derivation, scope
  questions); this bug is the concrete gap that exists *today* despite the
  infrastructure already being in place
- [BUG-0283](BUG-0283-backup-export-plaintext-credentials.md) — companion
  finding covering the backup-export half of the exposure; fix both so the
  credentials are neither readable at rest nor exportable in plaintext
- `src/stores/settings/secretsLoader.ts`
- `src/stores/settings.svelte.ts`
- `docs/adr/0001-local-first-boundary.md`
