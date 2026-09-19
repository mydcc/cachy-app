---
id: BUG-0521
title: indexedDB.open has no onblocked handler, so a concurrent factory reset leaves the device-key promise pending forever and secretsReady never resolves
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

# BUG-0521 — A blocked open hangs the credential load with no error

## Symptom

The app loads, shows its UI, and never finishes reading credentials. Settings
fields stay empty, every request that waits on `secretsReady` waits forever,
and nothing is logged. There is no error state to recover from because no
error was ever produced — the promise simply never settles.

## Evidence

**Derived.** `loadKeyFromDB` and `saveKeyToDB`
(`src/services/cryptoService.ts:391-440`) wrap `indexedDB.open` in a promise
that settles on two of the request's three terminal events:

```ts
return new Promise((resolve, reject) => {
  const request = indexedDB.open(SECURE_DB_NAME, 1);
  request.onupgradeneeded = () => { ... };
  request.onsuccess = () => { ... };
  request.onerror = () => reject(request.error);
});
```

`onblocked` is not handled. When it fires, neither `onsuccess` nor `onerror`
follows, and the promise stays pending.

The blocking case is one the same functions already know about. Both carry
this comment:

```ts
// Release the connection so a factory-reset deleteDatabase()
// is not blocked by it (BUG-0288). Aborted/errored transactions
// never fire oncomplete, so cover those paths too.
```

So a `deleteDatabase()` factory reset is an expected concurrent operation.
`BUG-0288` handled the direction where an open connection blocks the delete.
The opposite direction — an `open` issued while a `deleteDatabase` is pending,
or while another tab holds a version-change lock — is the unhandled one.

The pending promise is then cached. `SecretsLoader.getDeviceKey`
(`src/stores/settings/secretsLoader.ts:86-120`) stores it:

```ts
if (this._deviceKeyPromise) return this._deviceKeyPromise;
```

and its `.catch` clears the cache only on rejection. A promise that never
rejects is never cleared, so every later caller in the session receives the
same forever-pending promise. `decryptSecrets`,
`decryptAccountKeysWithDeviceKey` and `decryptProviderConfigsWithDeviceKey`
all await it, so the whole credential load stalls on one blocked request.

## Cause

`indexedDB.open` has three terminal outcomes and the wrapper handles two.
`onblocked` is the one that does not correspond to an obvious try/catch shape,
so it was not written — and because the result is a hang rather than a
throw, no error path exposes the omission.

## Fix

Handle `onblocked` in both wrappers. A blocked open is a legitimate transient
state, so the useful behaviour is to reject with a distinguishable error
after a bounded wait rather than to reject immediately — a factory reset
finishes quickly and a retry should succeed.

Add a timeout as the backstop. Any promise that gates `secretsReady` needs an
upper bound regardless of which specific event was missed; `onblocked` is the
one known cause, not a proof that it is the only one.

`getDeviceKey`'s `.catch` already clears `_deviceKeyPromise` so a transient
failure is retryable — that invariant is correct and is what makes rejecting
the right response here.

## Acceptance criteria

- [ ] A test reproduces the defect: `indexedDB.open` stubbed to fire only
      `onblocked`, and `getDeviceKey` never settles
- [ ] After the fix the same stub rejects with a distinguishable error and
      `_deviceKeyPromise` is cleared, so a second call retries
- [ ] Both `loadKeyFromDB` and `saveKeyToDB` handle `onblocked`
- [ ] A bounded timeout covers the general case, asserted by a test with a
      request that fires no event at all
- [ ] `BUG-0288`'s connection release still holds — a factory-reset
      `deleteDatabase()` is not blocked by these wrappers
- [ ] The normal path settles without waiting for the timeout
- [ ] Targeted `cryptoService` tests pass

## Out of scope

Reworking the factory-reset flow itself, and any change to when
`secretsReady` resolves.

Retry policy beyond making a retry possible — how many times the app should
re-attempt is a UX question, not this one.

## Links

- `src/services/cryptoService.ts:391-417` — `loadKeyFromDB`
- `src/services/cryptoService.ts:419-440` — `saveKeyToDB`
- `src/stores/settings/secretsLoader.ts:86-120` — `getDeviceKey`, caches the pending promise
- `BUG-0288` — the opposite direction of the same interaction, fixed
- [`BUG-0053`](BUG-0053-device-key-loss-orphans-secrets.md) — records a ~5s device-key resolution worth re-measuring against this
