---
id: BUG-0518
title: The device key is memoized but its loss guard is computed per caller, so whichever caller runs first decides whether the guard applies at all
type: bug
status: done
assignee: opencode
branch: fix/bug-0517-0518-device-key-guard
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
---

# BUG-0518 — Whoever gets there first decides whether the safety check runs

## Symptom

A user with saved secrets but no exchange accounts loses every secret after a
page load in which IndexedDB no longer holds the device key. The
`BUG-0053` protection that exists to prevent exactly this does not fire: a
fresh random key is minted and persisted, and every entry in
`encryptedSecrets` becomes permanently unopenable — the original
`BUG-0053` failure, reproduced through the door its own fix left open.

## Evidence

**Derived.** The guard is an *argument*, not a property of the key lookup.
`SecretsLoader.getDeviceKey` (`src/stores/settings/secretsLoader.ts:86-120`)
memoizes the result:

```ts
getDeviceKey(hasStoredSecrets: boolean): Promise<string | CryptoKey> {
  if (!browser) return Promise.resolve("server-side-key-placeholder");
  if (this._deviceKey) return Promise.resolve(this._deviceKey);
  if (this._deviceKeyPromise) return this._deviceKeyPromise;
  ...
  .getOrGenerateDeviceKey(legacyKey || undefined, hasStoredSecrets)
```

`hasStoredSecrets` is consumed **only** on the first call that creates the
promise. Every later caller's value is discarded by the two early returns.

The callers disagree about what that flag means, because each measures only
its own material:

- `decryptSecrets` (`secretsLoader.ts:240-265`)
  — `Object.keys(encryptedSecrets || {}).length > 0`
- `decryptAccountKeysWithDeviceKey` (`secretsLoader.ts:332-359`)
  — `this.getDeviceKey(accountIds.length > 0)`
- `isDeviceKeyLost` (`secretsLoader.ts:218-231`)
  — `Object.keys(encryptedSecrets || {}).length > 0`
- `decryptProviderConfigsWithDeviceKey` (`secretsLoader.ts:476`)
  — its own provider-config count

So a user with secrets but **no accounts** has
`decryptAccountKeysWithDeviceKey` pass `false` while `decryptSecrets` would
pass `true`. Both are correct about themselves and neither is correct about
the device key, which is shared by all four. If the account path wins the
race, `getOrGenerateDeviceKey` skips

```ts
if (hasEncryptedSecrets) {
  throw new Error("DeviceKeyLost: Device key is missing but encrypted secrets exist.");
}
```

and proceeds to mint and `saveKeyToDB` a fresh key. The later
`decryptSecrets` call receives the memoized *new* key and fails every blob
with `OperationError` — the exact console signature recorded in `BUG-0053`.

The ordering is not hypothetical: all four are `async` and nothing
serializes them.

## Cause

A guard whose correctness depends on a global fact ("does any Class-A
ciphertext exist?") was implemented as a parameter supplied by callers who
each know only a local fact. Memoization then made the first local answer
authoritative for the session.

## Fix

Make the guard measure what it is about. `getOrGenerateDeviceKey` should not
take `hasEncryptedSecrets` from its caller; the presence of orphaned
ciphertext should be established once, from all four stores together
(`encryptedSecrets`, `encryptedAccountKeys`, encrypted provider configs, and
the `_deviceKeyCanary`), inside the loader that owns them.

The mechanism, not the line: `getDeviceKey`'s parameter should go away
entirely, so no caller can supply a weaker answer than another. Compute the
flag in one place at the point the loader first resolves the key, and let the
memoized promise carry that single decision.

## Acceptance criteria

- [ ] A test reproduces the defect: non-empty `encryptedSecrets`, zero
      accounts, `loadKeyFromDB` returning `null`, and
      `decryptAccountKeysWithDeviceKey` awaited first — today's code persists
      a new device key
- [ ] After the fix the same ordering throws `DeviceKeyLost` and persists no
      key, asserted by a spy on `saveKeyToDB`
- [ ] The reverse ordering (`decryptSecrets` first) behaves identically,
      asserted by a test — the outcome no longer depends on call order
- [ ] Provider configs and account keys count toward the guard, not only
      `encryptedSecrets`, asserted by a test for each store on its own
- [ ] First run — all four stores empty — still mints a key without
      prompting
- [ ] `getDeviceKey` no longer accepts a caller-supplied `hasStoredSecrets`
- [ ] Targeted `secretsLoader` and `cryptoService` tests pass

## Out of scope

Serializing the four decrypt paths, or changing when settings load runs them.
The fix is to make the guard independent of ordering, not to impose an
ordering.

The `DeviceKeyLost` error's user-facing presentation, which `BUG-0053`
already shipped.

## Links

- `src/stores/settings/secretsLoader.ts:86-120` — `getDeviceKey`, the memoization
- `src/stores/settings/secretsLoader.ts:218-231` — `isDeviceKeyLost`
- `src/stores/settings/secretsLoader.ts:240-265` — `decryptSecrets`
- `src/stores/settings/secretsLoader.ts:332-359` — `decryptAccountKeysWithDeviceKey`
- `src/services/cryptoService.ts:351-389` — the guard being disarmed
- [`BUG-0053`](BUG-0053-device-key-loss-orphans-secrets.md) — the failure this reproduces
- [`BUG-0517`](BUG-0517-canary-guard-made-the-legacy-device-key-migration-unreachable.md) — the same guard, defeated a different way
