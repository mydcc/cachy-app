---
id: BUG-0053
title: A lost or regenerated IndexedDB device key silently orphans every encrypted secret
type: bug
status: specced
priority: P0
milestone: M0
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
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
measurement should happen before picking among the fix options below, since
it changes which one actually addresses the root cause.

## Cause

`getOrGenerateDeviceKey()` cannot distinguish "first run, no secrets exist yet"
from "the device key is gone but encrypted secrets are still sitting in
`localStorage`." Both look identical from IndexedDB's point of view (empty),
so both take the same "generate a fresh key" branch — the second case just
silently strands existing data instead.

## Fix

Not decided yet; options to weigh. Start with measurement, then pick:

0. **Instrument first.** Time `loadKeyFromDB()`/`indexedDB.open()` directly
   (e.g. `performance.now()` around each await in `getOrGenerateDeviceKey()`)
   to find out where the observed ~5s actually goes, per the timing note in
   Evidence above. If it is inside the IndexedDB call itself, that changes the
   likely cause (storage-layer contention, not necessarily key loss) and may
   deserve its own performance fix independent of 1-3 below.
1. **Detect the mismatch before minting a new key.** Store a small canary
   alongside `encryptedSecrets` (e.g. a fixed known plaintext encrypted with
   the current device key) so `getOrGenerateDeviceKey()` — or the caller in
   `settings.svelte.ts` — can tell "no key and no data" apart from "no key but
   orphaned data" and react differently (e.g. refuse to silently regenerate;
   surface a recovery prompt instead).
2. **Make the failure user-visible.** Today the only signal is
   `console.error`. At minimum, when one or more `SENSITIVE_KEYS` fail to
   decrypt, Settings should show something a user can act on ("N saved keys
   could not be read and need to be re-entered") instead of quietly leaving
   fields blank.
3. **Reduce how often this can happen.** Investigate whether the device key
   can be made to survive independently of IndexedDB's eviction policy (e.g.
   a secondary copy, a different storage API), while keeping ADR-0001's
   local-only guarantee intact.

Whichever is chosen, recovery for a user who already hit this is necessarily
"re-enter the affected keys" — the plaintext is gone once the device key that
encrypted it is gone. This item is about detection and a recoverable UX, not
about recovering already-orphaned ciphertext.

## Acceptance criteria

- [ ] A test reproduces the defect: encrypt a secret under one device key,
      then attempt decryption after `loadKeyFromDB` is made to return `null`
      (simulating a lost IndexedDB key) with `encryptedSecrets` still present,
      and show today's code either silently regenerates a key or fails with no
      user-visible signal
- [ ] The chosen fix makes that scenario either refuse to silently mint a
      replacement key, or surface a clear, actionable message to the user (per
      whichever option above is chosen) — not just a `console.error`
- [ ] Existing decrypt/unlock tests for the normal (matching device key) path
      are unaffected
- [ ] `npm run check` and `npm test` are clean

## Out of scope

Recovering plaintext for secrets already orphaned by a device key that is
gone — there is nothing left to recover it from, by design (ADR-0001, no
server-side copy of Class-A data). This item is about detecting and
communicating the failure going forward, not undoing past instances of it.

Master-password mode's `unlock()` path (`settings.svelte.ts:989-1043`) has the
same "per-key catch, only `console.error`" shape and would benefit from the
same user-visible-failure fix (option 2 above), but the mismatch-detection
question (option 1) doesn't apply there the same way, since a wrong password
is a different failure class than a lost device key. Worth revisiting once
this item's approach is chosen, not bundled into it.

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
