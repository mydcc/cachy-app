---
id: BUG-0517
title: The BUG-0053 canary guard runs before the legacy device-key migration, so an upgrading user is told the key is lost while it still sits in localStorage
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
---

# BUG-0517 — The migration is unreachable in exactly the case it exists for

## Symptom

A user upgrading from a build that kept the device key in `localStorage`
under `cachy_device_id` — and who has encrypted secrets or exchange API keys
saved — gets `DeviceKeyLost` instead of a migration. Settings shows empty
credential fields and the user is asked to re-enter every API key, while the
key material that would open them is still sitting in `localStorage`,
untouched, one branch further down the same function.

## Evidence

**Derived.** Two pieces of `src/services/cryptoService.ts:351-389`
(`getOrGenerateDeviceKey`) disagree about ordering:

```ts
// 1. Try to load from IndexedDB
let key = await this.loadKeyFromDB(DEVICE_KEY_ALIAS);
if (key) return key;

if (hasEncryptedSecrets) {
  throw new Error("DeviceKeyLost: Device key is missing but encrypted secrets exist.");
}

// 2. Migration or Generation
if (legacyHexKey) {
  // Import legacy hex key as a non-extractable PBKDF2 CryptoKey ...
```

The guard added for [`BUG-0053`](BUG-0053-device-key-loss-orphans-secrets.md)
(shipped 1.6.0-beta.15) sits **above** the `legacyHexKey` branch. The
migration therefore runs only when `hasEncryptedSecrets` is false — that is,
only when there is nothing to migrate. Whenever the user actually has secrets
encrypted under the legacy key, the function throws before it looks at the
parameter its caller went out of its way to supply.

The caller does supply it (`src/stores/settings/secretsLoader.ts:86-120`,
`SecretsLoader.getDeviceKey`):

```ts
const legacyKey = localStorage.getItem("cachy_device_id");
this._deviceKeyPromise = cryptoService
  .getOrGenerateDeviceKey(legacyKey || undefined, hasStoredSecrets)
```

so `legacyHexKey` and `hasEncryptedSecrets` are both true together in the
upgrade case — the one combination the ordering makes unserviceable.

One mitigation holds: `localStorage.removeItem("cachy_device_id")` runs only
on the resolved path, so the throw does **not** destroy the legacy key. The
data is recoverable; the code just refuses to reach for it.

## Cause

`BUG-0053` treated "no key in IndexedDB" as equivalent to "key lost". It is
not: a legacy key in `localStorage` is a third state, and it was already
handled below. The guard was inserted without noticing that the branch it
shadows is the recovery path.

## Fix

Attempt the legacy migration *before* the `hasEncryptedSecrets` guard, and
keep the guard for the case where no legacy key exists either. The guard's
purpose — never mint a *fresh random* key while orphaned ciphertext exists —
is untouched by that reordering: a migrated legacy key is not a fresh key.

Verify the migrated key before committing to it. `isDeviceKeyLost`
(`secretsLoader.ts:218-231`) already knows how to test a key against the
`_deviceKeyCanary`; the migration should use the same check and fall through
to `DeviceKeyLost` when the imported key does not open the canary, rather
than persisting a key that cannot read the data.

While reordering, validate the hex input. Today:

```ts
const keyData = new Uint8Array(legacyHexKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
```

accepts any string. A non-hex character yields `NaN`, which `Uint8Array`
coerces to `0`; an odd-length string makes the final chunk a single nibble and
shifts every byte after it. Either produces a silently wrong key that is then
persisted to IndexedDB permanently, because step 1 returns it on every later
call. Reject input that is not an even-length hex string and treat it as "no
legacy key" instead.

## Acceptance criteria

- [ ] A test reproduces the defect: a legacy `cachy_device_id` in
      `localStorage` plus a non-empty `encryptedSecrets`, and today's code
      throws `DeviceKeyLost` without importing the legacy key
- [ ] After the fix the same fixture migrates: the legacy key is imported,
      persisted to IndexedDB, and the existing secrets decrypt
- [ ] The migrated key is checked against `_deviceKeyCanary` before it is
      persisted; a key that fails the canary is not written and the call
      still reports `DeviceKeyLost`
- [ ] `BUG-0053`'s protection still holds: no legacy key and non-empty
      `encryptedSecrets` mints no key, asserted by a test
- [ ] A non-hex or odd-length `cachy_device_id` is rejected rather than
      silently producing a zero-byte key, asserted by a test
- [ ] `localStorage` cleanup of `cachy_device_id` happens only after the
      canary check passed
- [ ] Targeted tests for `cryptoService` and `secretsLoader` pass

## Out of scope

Any change to how fresh device keys are generated or stored, and the
IndexedDB eviction hardening `BUG-0053` deliberately excluded.

Recovering secrets for a user who already re-entered their keys after hitting
this — there is nothing to recover; the ciphertext they abandoned is still
openable by the legacy key, but that is a manual recovery, not a code path.

## Links

- `src/services/cryptoService.ts:351-389` — `getOrGenerateDeviceKey`, the ordering
- `src/stores/settings/secretsLoader.ts:86-120` — `getDeviceKey`, supplies both arguments
- `src/stores/settings/secretsLoader.ts:218-231` — `isDeviceKeyLost`, the canary check to reuse
- [`BUG-0053`](BUG-0053-device-key-loss-orphans-secrets.md) — the item whose fix introduced the ordering
- [`BUG-0518`](BUG-0518-memoized-device-key-lets-the-first-caller-disarm-the-guard.md) — the same guard, defeated a different way
