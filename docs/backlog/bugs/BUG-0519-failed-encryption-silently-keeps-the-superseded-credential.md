---
id: BUG-0519
title: A failed encryption is silent in production and leaves the superseded ciphertext in place, so the app keeps signing with the credential the user replaced
type: bug
status: in-progress
branch: fix/bug-0519-encryption-failure-stale-credential
assignee: opencode
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
---

# BUG-0519 — Rotating a leaked API key can leave the leaked key in use

## Symptom

A user rotates an exchange API key or an AI provider key — pastes the new
value, saves, and sees the new key in Settings. The save's encryption step
fails. Nothing is shown. After the next reload the app is signing requests
with the **old** key again, and the Settings field shows the old key as
though the rotation never happened.

If the old key was rotated because it leaked, the app continues using the
leaked credential against a live exchange account.

## Evidence

**Derived.** Two independent facts, both in
`src/stores/settings/secretsLoader.ts`.

**The failure is invisible in a production build.**
`applyFieldEncryption` (`:273-324`):

```ts
} catch (err) {
  if (import.meta.env.DEV) {
    console.error(`[Settings] Failed to encrypt ${key}:`, err);
  }
  // @ts-expect-error -- dynamic index over SENSITIVE_KEYS on an untyped payload
  data[key] = "";
}
```

and `applyAccountKeyEncryption` (`:372-426`):

```ts
} catch (err) {
  // Never fall back to plaintext: keep any previous ciphertext and
  // let the next save retry. The in-memory copy stays untouched.
  if (import.meta.env.DEV) {
    console.error(
      `[Settings] Failed to encrypt API keys for account ${account.id}:`,
      err,
    );
  }
}
```

Both gate the only signal behind `import.meta.env.DEV`. In a shipped build
there is no console line, no counter, no user-facing state. Contrast the
decrypt side, which logs unconditionally and returns a failure count
(`decryptSecrets:240-265`, `decryptAccountKeysWithDeviceKey:332-359`) — the
two directions disagree about whether a crypto failure is worth reporting.

**The superseded ciphertext survives the failure.** Neither catch writes to
`data.encryptedSecrets[key]` / `data.encryptedAccountKeys[account.id]`, so
whatever was persisted before the rotation stays persisted. The comment in
`applyAccountKeyEncryption` states this as the intent, and as a
never-persist-plaintext rule it is right. What neither path does is record
that the persisted value is now **stale relative to what the user is being
shown** — the in-memory copy holds the new key, `localStorage` holds the old
ciphertext, and only the second survives a reload.

The window is real rather than theoretical: `cryptoService.encrypt` throws
whenever the session is locked with no key available, when
`window.crypto.subtle` is absent outside a secure context (see the
LAN-IP self-hosting case), and on any `deriveKey` rejection.

## Cause

The two paths correctly refuse to write plaintext on failure, and stop there.
"Do not persist the new value" was treated as sufficient, without asking what
the *old* persisted value then means. A save that partially failed is
reported to no one, so the divergence between shown state and stored state
cannot be noticed until it causes a wrong-credential request.

## Fix

Make a failed encryption a first-class outcome rather than a swallowed one.

1. Log unconditionally, matching the decrypt side. `import.meta.env.DEV` is
   the wrong gate for a Class-A persistence failure.
2. Return a failure count from both methods, the way
   `decryptSecrets` already does, and let `SettingsManager.save` surface it.
3. When a field's encryption failed and a *previous* blob for that field is
   still present, the stale blob must not be allowed to answer for the new
   value. Either drop it — the user re-enters, which is recoverable — or mark
   the save incomplete and retry before the store is considered saved.
   Choosing between those is the design decision in this item; silently
   keeping it is what must stop.

The rule the fix should encode: persisted credential state is never allowed
to disagree with displayed credential state without the user being told.

## Acceptance criteria

- [ ] A test reproduces the defect: a stored ciphertext for a
      `SENSITIVE_KEYS` field, a new plaintext value, `cryptoService.encrypt`
      made to reject, and after a reload the store resolves to the **old**
      secret while no signal was produced
- [ ] The same reproduction for `encryptedAccountKeys` via
      `applyAccountKeyEncryption`
- [ ] Encryption failures are logged in production builds, asserted by a test
      that does not stub `import.meta.env.DEV`
- [ ] Both methods report a failure count and `SettingsManager.save`
      propagates it
- [ ] The user sees an actionable message naming how many credentials failed
      to save, in German and English
- [ ] No path ever writes plaintext to `localStorage` — the existing
      guarantee is asserted by a test, not assumed
- [ ] Targeted `secretsLoader` and `settings` tests pass

## Out of scope

Retry policy for a locked session — whether a failed save should re-prompt
for the master password is its own question.

The decrypt-side reporting, which `BUG-0053` already shipped.

## Links

- `src/stores/settings/secretsLoader.ts:273-324` — `applyFieldEncryption`
- `src/stores/settings/secretsLoader.ts:372-426` — `applyAccountKeyEncryption`
- `src/stores/settings/secretsLoader.ts:240-265` — `decryptSecrets`, the unconditional logging to match
- `src/services/cryptoService.ts:153-214` — `encrypt`, the throw sites
- [`BUG-0053`](BUG-0053-device-key-loss-orphans-secrets.md) — the decrypt-side analogue, fixed
- [`docs/adr/0001-local-first-boundary.md`](../../adr/0001-local-first-boundary.md) — why plaintext must never be the fallback
