---
id: BUG-0053
title: A lost or regenerated IndexedDB device key silently orphans every encrypted secret
type: bug
status: done
priority: P0
milestone: M0
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
estimate: 2
size: S
target_date: 2026-08-24
start_date: 2026-08-07
---


# BUG-0053 — A lost or regenerated IndexedDB device key silently orphans every encrypted secret

## Symptom

In "Obfuscation Mode" (no master password), every Class-A secret in
`SENSITIVE_KEYS` — `openaiApiKey`, `geminiApiKey`, `anthropicApiKey`,
`discordBotToken`, `newsApiKey`, `cryptoPanicApiKey`, `cmcApiKey`,
`imgbbApiKey`, `appAccessToken`, `cloudToken` — fails to decrypt at once, each
logging its own `[Settings] Failed to decrypt secret <key> OperationError` to
the console. The user gets no in-app message: Settings silently shows the
fields as empty, and every feature that depends on one of them breaks
downstream with its own, unrelated-looking symptom — e.g. `/api/sentiment`
answers 401 because `appAccessToken` decrypted to `""` and
`appAuthHeaders()` (`src/lib/appAuth.ts`) correctly omits the header for an
empty token.

## Evidence

**Demonstrated**, from a live browser console on `dev.cachy.app`:

```
Decryption failed OperationError
    at J.attemptDecrypt ...
[Settings] Failed to decrypt secret geminiApiKey OperationError
Decryption failed OperationError
[Settings] Failed to decrypt secret newsApiKey OperationError
Decryption failed OperationError
[Settings] Failed to decrypt secret cryptoPanicApiKey OperationError
Decryption failed OperationError
[Settings] Failed to decrypt secret cmcApiKey OperationError
Decryption failed OperationError
[Settings] Failed to decrypt secret imgbbApiKey OperationError
POST https://dev.cachy.app/api/sentiment 401 (Unauthorized)
```

Every secret failed in the same page load — not one isolated key. That pattern
points at the shared dependency all of them decrypt through: the device key.

The mechanism is **derived**, from reading the two places involved, though the
exact browser event that caused it this time (storage cleared, private window,
storage eviction, a different profile) was not captured:

- `settings.svelte.ts:1236-1266` — on every load in Obfuscation Mode, the app
  fetches one device key via `getDeviceKey()` and decrypts *every*
  `encryptedSecrets` entry with it, independently, inside a
  `Promise.all`. A per-key failure is caught and only `console.error`'d
  (`settings.svelte.ts:1259-1264`) — nothing aggregates "N of M secrets failed"
  into a user-visible state.
- `cryptoService.ts:318-352` (`getOrGenerateDeviceKey`) tries to load the
  device key from IndexedDB (`loadKeyFromDB`, line 322) and, if that returns
  nothing, **silently generates and persists a brand-new random key** — no
  check for whether `encryptedSecrets` already has entries that only the *old*
  key could open. IndexedDB and `localStorage` are cleared independently by
  browsers (differing eviction/ITP policies, "clear site data" behaving
  inconsistently across storage types, a private window ending). If IndexedDB
  loses the device key while `localStorage`'s `encryptedSecrets` blob
  survives, this path runs, mints an unrelated key, and every existing secret
  becomes permanently unopenable with that key — matching the symptom exactly.

This is the AES-GCM/device-key path, not the AES-CBC path BUG-0004 already
fixed (`c3157101`) — that fix retried PBKDF2 parameters for legacy blobs and is
unrelated to a device key going missing.

**Also observed, same session:** the device key resolves roughly 5 seconds
after the page finishes loading, while other requests that don't need it
(public market data) have already gone out and come back. This is consistent
with the mechanism above, not evidence of a separate race: `appFetch`
(`src/lib/appAuth.ts`) already awaits `settingsState.secretsReady` before
sending, and `secretsReady` only resolves once the full
decrypt-every-`SENSITIVE_KEY` pass (`settings.svelte.ts:1244-1276`) finishes —
so a slow device-key lookup delays every secret-dependent request uniformly
*by design*; it doesn't let any of them through early with a stale or missing
value. What is unusual is the 5 seconds itself: a single IndexedDB `get`
(`loadKeyFromDB`) is normally sub-millisecond. Worth measuring directly, not
guessing, whether that time is inside `indexedDB.open()`/the transaction
(which would point at storage-layer contention — e.g. another connection
holding a version-change lock — and could itself be *why* the key looked
"missing" to `getOrGenerateDeviceKey()` in the first place, rather than it
truly being gone), or upstream of it entirely (e.g. lazy-chunk load latency
for the JS bundle hosting this code, unrelated to IndexedDB). That
measurement is the first step of the Fix below (option 0). It does not gate
the rest of the work — its result decides whether a *separate* performance
item is needed, not whether 1 and 2 are worth building.

## Cause

`getOrGenerateDeviceKey()` cannot distinguish "first run, no secrets exist yet"
from "the device key is gone but encrypted secrets are still sitting in
`localStorage`." Both look identical from IndexedDB's point of view (empty),
so both take the same "generate a fresh key" branch — the second case just
silently strands existing data instead.

## Fix

Decided: **measure first (0), then build 1 and 2 together.** Option 3 from the
original list (hardening the device key against IndexedDB eviction) is
deliberately excluded — see Out of scope.

0. **Instrument first.** Time `loadKeyFromDB()`/`indexedDB.open()` directly
   (e.g. `performance.now()` around each await in `getOrGenerateDeviceKey()`)
   to find out where the observed ~5s actually goes, per the timing note in
   Evidence above. This is the first step of the work, not a gate on it: 1 and
   2 are worth building whatever the number says. If the time turns out to sit
   inside the IndexedDB call itself, that points at storage-layer contention
   rather than key loss — record the measurement here and raise a separate
   performance item; do not widen this one to chase it.
1. **Detect the mismatch before minting a new key.** Store a small canary
   alongside `encryptedSecrets` (a fixed known plaintext encrypted with the
   current device key) so `getOrGenerateDeviceKey()` — or the caller in
   `settings.svelte.ts` — can tell "no key and no data" apart from "no key but
   orphaned data", and refuse to silently regenerate in the second case,
   surfacing a recovery prompt instead.
2. **Make the failure user-visible.** Today the only signal is
   `console.error`. When one or more `SENSITIVE_KEYS` fail to decrypt,
   Settings shows something the user can act on ("N saved keys could not be
   read and need to be re-entered") instead of quietly leaving fields blank.

1 and 2 are both needed and neither substitutes for the other: 1 addresses the
cause (the silent regeneration that strands the data), 2 addresses the symptom
(a failure with no signal). The canary cannot help a user whose key is already
gone, and a visible message alone would still let the app strand freshly
entered secrets under a newly minted key.

Recovery for a user who already hit this is necessarily "re-enter the affected
keys" — the plaintext is gone once the device key that encrypted it is gone.
This item is about detection and a recoverable UX, not about recovering
already-orphaned ciphertext.

## Acceptance criteria

- [ ] A test reproduces the defect: encrypt a secret under one device key,
      then attempt decryption after `loadKeyFromDB` is made to return `null`
      (simulating a lost IndexedDB key) with `encryptedSecrets` still present,
      and show today's code either silently regenerates a key or fails with no
      user-visible signal
- [ ] `getOrGenerateDeviceKey()` refuses to mint a replacement key when the
      canary shows `encryptedSecrets` exists but cannot be opened — asserted by
      a test that no new key is persisted on that path
- [ ] The first-run path still works: no key and no encrypted secrets
      generates a key without prompting, asserted by a test
- [ ] When one or more `SENSITIVE_KEYS` fail to decrypt, Settings surfaces an
      actionable message naming how many keys are affected — not just a
      `console.error`
- [ ] German and English strings for every new user-facing message
- [ ] The timing of `loadKeyFromDB()`/`indexedDB.open()` is measured and the
      result recorded in this item; if it points at storage-layer contention, a
      separate performance item is raised rather than fixed here
- [ ] Existing decrypt/unlock tests for the normal (matching device key) path
      are unaffected
- [ ] `npm run check` and `npm test` are clean

## Out of scope

Hardening the device key against IndexedDB's eviction policy — a secondary
copy, a different storage API — which was option 3 in the original list. It
touches ADR-0001's local-only guarantee directly and needs its own
investigation; this item must not grow into a storage-architecture change.
Worth raising as its own item if the measurement in option 0 shows key loss is
frequent rather than incidental.

Recovering plaintext for secrets already orphaned by a device key that is
gone — there is nothing left to recover it from, by design (ADR-0001, no
server-side copy of Class-A data). This item is about detecting and
communicating the failure going forward, not undoing past instances of it.

Master-password mode's `unlock()` path (`settings.svelte.ts:989-1043`) has the
same "per-key catch, only `console.error`" shape and would benefit from the
same user-visible-failure fix (option 2 above), but the mismatch-detection
question (option 1) doesn't apply there the same way, since a wrong password
is a different failure class than a lost device key. Worth raising as its own
item once option 2 has landed here, not bundled into this one.

## Links

- `src/services/cryptoService.ts:318-352` — `getOrGenerateDeviceKey()`,
  `loadKeyFromDB()`
- `src/stores/settings.svelte.ts:1236-1266` — the Obfuscation Mode decrypt
  loop that surfaced this
- `src/stores/settings.svelte.ts:989-1043` — the analogous master-password
  `unlock()` path
- `src/lib/appAuth.ts` — why a decrypted-empty `appAccessToken` produces a
  clean 401 rather than a crash, downstream of this bug
- [`BUG-0004`](BUG-0004-legacy-aes-cbc-blobs.md) — same subsystem
  (`cryptoService.ts`), different mechanism (legacy AES-CBC iteration
  fallback, already fixed)
- [`docs/adr/0001-local-first-boundary.md`](../../adr/0001-local-first-boundary.md)
  — why there is no server-side copy to fall back to

## What shipped

Shipped in 1.6.0-beta.15.
