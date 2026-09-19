---
id: BUG-0520
title: attemptDecrypt ignores its iterations argument on every branch a production caller uses, so the legacy PBKDF2 fallback is a duplicate attempt rather than a recovery path
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
---

# BUG-0520 — The third rung of the legacy ladder is the second rung again

## Symptom

An AES-CBC blob written by the oldest CryptoJS-era builds — the case
`BUG-0004` restored a three-attempt fallback for — still fails to decrypt
when it is opened with the device key, which is how every stored secret and
every exchange credential is opened. The user is told the secret cannot be
read; the fallback that exists to read it never runs with the parameters it
was written for.

## Evidence

**Derived.** `src/services/cryptoService.ts:297-342` (`decrypt`) defines the
ladder:

```ts
const legacyAttempts: Array<{ iterations: number; hash: "SHA-256" | "SHA-1" }> = [
  { iterations: STRONG_ITERATIONS, hash: "SHA-256" },
  { iterations: STRONG_ITERATIONS, hash: "SHA-1" },
  { iterations: LEGACY_ITERATIONS, hash: "SHA-1" }, // for blobs older still
];
```

Rungs 2 and 3 differ **only** in `iterations`. But `attemptDecrypt`
(`:218-295`) applies that argument on exactly one of its three
key-derivation branches:

```ts
private async attemptDecrypt(
  blob: EncryptedBlob,
  password?: string | CryptoKey,
  hashAlgo: "SHA-512" | "SHA-256" | "SHA-1" = "SHA-512",
  iterations: number = STRONG_ITERATIONS,
): Promise<string> {
  ...
  if (password instanceof CryptoKey) {
    if (password.algorithm.name === "PBKDF2") {
      key = await window.crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: STRONG_ITERATIONS, hash: hashAlgo },
  ...
  } else if (this.sessionBaseKey && !password) {
      key = await this.getSessionKeyForSalt(salt, ["decrypt"], hashAlgo);
  } else if (typeof password === 'string' && password) {
      if (blob.method === "AES-GCM") {
        key = await this.deriveKeyFromPassword(password, salt, STRONG_ITERATIONS, hashAlgo);
      } else {
        // Legacy or CBC. Import as CBC key.
        ... iterations ...
```

The `CryptoKey` branch hard-codes `STRONG_ITERATIONS`. The session-key branch
delegates to `getSessionKeyForSalt` (`:99-115`), which also hard-codes
`STRONG_ITERATIONS` and takes no iteration parameter at all. Only the
string-password + non-GCM branch honours the argument.

Every production decryption of Class-A material passes a `CryptoKey`:
`decryptSecrets`, `decryptAccountKeysWithDeviceKey`,
`decryptProviderConfigsWithDeviceKey` and `isDeviceKeyLost` all call
`cryptoService.decrypt(blob, deviceKey)` with the device `CryptoKey`
(`src/stores/settings/secretsLoader.ts:225`, `:245`, `:336`, `:480`). For all
of them rung 3 is byte-identical to rung 2, so the ladder makes three
attempts covering two configurations.

`getSessionKeyForSalt` caches derived keys by
`base64(salt) + "_" + hashAlgo`. The cache key omits the iteration count,
which is consistent only because the iteration count is never varied — the
cache would return a wrong key the moment the branch started honouring it.
That is worth fixing in the same change rather than after it.

## Cause

`iterations` was threaded into `attemptDecrypt`'s signature alongside
`hashAlgo`, but only the one branch that existed when `BUG-0004` was written
was updated to use it. The two branches added later for session keys and
device keys derive with a constant, so the parameter became advisory.

## Fix

Honour `iterations` on every branch that derives from PBKDF2 material, and
include it in the `sessionKeyCache` key so a varied iteration count cannot
return a stale derivation.

If the conclusion is instead that device-key blobs never existed at
`LEGACY_ITERATIONS` — plausible, since the device key postdates the CryptoJS
rewrite — then the honest fix is the opposite one: drop the parameter, drop
rung 3 for those callers, and say so in a comment, so the code stops
promising a recovery it cannot perform. Establishing which of the two is true
is the first step of this item.

## Acceptance criteria

- [ ] The question is settled first and recorded here: can a blob encrypted
      under a device `CryptoKey` exist at `LEGACY_ITERATIONS`? Check the git
      history of `cryptoService.ts` around the CryptoJS rewrite (`560a15c7`)
- [ ] A test asserts the current behaviour: `attemptDecrypt` called with a
      `CryptoKey` and `LEGACY_ITERATIONS` derives with `STRONG_ITERATIONS`
- [ ] If the fallback is needed: rungs 2 and 3 produce different derivations
      for a `CryptoKey` caller, asserted by a test, and a fixture blob
      written at `LEGACY_ITERATIONS` decrypts
- [ ] If it is not needed: the dead rung and the unused parameter are removed
      rather than left in place, and the reason is in a comment
- [ ] `sessionKeyCache` keys include the iteration count, asserted by a test
      that derives twice for one salt at two iteration counts
- [ ] The normal path — `kdfHash` present, single `attemptDecrypt`, no
      ladder — is unaffected
- [ ] Targeted `cryptoService` tests pass

## Out of scope

Changing `STRONG_ITERATIONS` or the KDF parameters for new blobs.

The AES-GCM `kdfHash` fallback below the ladder, which is a hash question and
not an iteration question.

## Links

- `src/services/cryptoService.ts:218-295` — `attemptDecrypt`, the ignored argument
- `src/services/cryptoService.ts:297-342` — `decrypt`, the ladder
- `src/services/cryptoService.ts:99-115` — `getSessionKeyForSalt`, the cache key
- `src/stores/settings/secretsLoader.ts:225,245,336,480` — the four `CryptoKey` callers
- `BUG-0004` — the item that introduced the ladder
