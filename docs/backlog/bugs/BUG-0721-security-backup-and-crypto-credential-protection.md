---
id: BUG-0721
title: Security: backup export leaks encrypted provider configs and restore injects credentials without validation
type: bug
status: done
priority: P0
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: ADR-0001
depends_on: []
---

# BUG-0721 — Security: backup export leaks encrypted provider configs and restore injects credentials without validation

> **State note.** All six sub-findings are fixed. Unencrypted export and
> restore share one scrubber (provider configs included); an unencrypted
> restore can no longer inject a credential, while an encrypted backup keeps
> its credentials. `unlockSession` proves the password against a stored blob
> (canary first) and stays locked on a mismatch. Restore rejects an
> unsupported `kdfHash`. Pre-canary migration verifies the legacy key against
> a real ciphertext blob and refuses to persist it when it opens nothing.
> A locked save redacts every plaintext credential and reports it as unsaved,
> which the existing "re-enter" banner surfaces.

## Symptom

Multiple Class A data protection gaps in the backup/crypto subsystem:

1. **Unencrypted backup leaks `encryptedProviderConfigs`**: `sanitizeSettingsForUnencryptedExport` in `backupService.ts` blanks `encryptedSecrets`, `encryptedAccountKeys`, `encryptedApiKeys`, and all `SENSITIVE_KEYS`, but omits `encryptedProviderConfigs` (FEAT-0467 user-provider API keys). An unencrypted export ships a device-key-encrypted blob of provider credentials.

2. **Backup restore injects credentials without sanitization**: `restoreFromBackup` validates settings structure but does not strip `apiKeys`, `encryptedAccountKeys`, `encryptedSecrets`, `accounts[].keys`, or `encryptedProviderConfigs`. A crafted backup can inject exchange API keys or pivot hosts (`spacetimedbHost`, `ollamaCustomHost`).

3. **`unlockSession` accepts any password**: PBKDF2 derivation never fails for arbitrary input, so `unlockSession` returns `true` for any non-empty password. Downstream re-encryption with a wrong password can destroy recoverable secrets.

4. **KDF-hash downgrade**: `restoreFromBackup` copies `backup.kdfHash` without validation, allowing SHA-1 downgrade.

5. **Legacy device-key migration unverified**: `getOrGenerateDeviceKey` accepts a legacy hex key without canary verification when no canary exists. Combined with restore injection, an attacker can supply both key and ciphertext.

6. **Locked-session retains `openrouterApiKey` in plaintext**: When locked, `openrouterApiKey` is retained if no ciphertext blob exists, persisting in cleartext to localStorage.

## Evidence

**Demonstrated** — all defects follow from reading the code:

- `src/services/backupService.ts` — `sanitizeSettingsForUnencryptedExport` omits `encryptedProviderConfigs`
- `src/services/backupService.ts` — `restoreFromBackup` / `validateSettings` no credential stripping
- `src/services/cryptoService.ts` — `unlockSession` no password verification
- `src/services/cryptoService.ts` — `getOrGenerateDeviceKey` canary check guarded by `if (canaryBlob)`
- `src/services/backupService.ts` — `kdfHash` not validated on restore
- `src/stores/settings/secretsLoader.ts` — `openrouterApiKey` retained in locked branch

Fingerprints: `backup:sanitize:encryptedProviderConfigsLeak`, `backup:restore:credentialInjection`, `crypto:unlockSession:noPasswordVerification`, `crypto:legacyMigration:unverifiedKeyAcceptance`, `backup:restore:kdfHashDowngrade`, `secrets:lockedSession:openrouterKeyRetention`

## Fix

1. Add `delete parsed.encryptedProviderConfigs;` to sanitizer.
2. Add restore-time sanitizer mirroring `sanitizeSettingsForUnencryptedExport` (strip credentials unless encrypted under user password).
3. Verify password against stored canary/ciphertext in `unlockSession` before setting `sessionBaseKey`.
4. Whitelist `kdfHash` to SHA-256/SHA-512 on restore.
5. Fail closed on legacy migration when no canary and orphaned ciphertext exists.
6. Redact or device-key-encrypt `openrouterApiKey` in locked branch; add `imgurClientId` to `SENSITIVE_KEYS`.

## Acceptance criteria

- [x] No `encrypted*` key survives unencrypted export sanitization
- [x] Restore strips credential fields (apiKeys, encryptedAccountKeys, encryptedSecrets, encryptedProviderConfigs, accounts[].keys)
- [x] `unlockSession` returns `false` for wrong password
- [x] `kdfHash` validated against allowlist on restore
- [x] Legacy migration fails closed without canary when ciphertext exists
- [x] No plaintext credential persists in locked session
- [x] Regression tests for all fixes

## Links

Security audit run-1: `~/security-audit-skill/cachy-app/run-1/`
