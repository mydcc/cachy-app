---
id: BUG-0570
title: The order dispatch guard's account fingerprint collides on short keys
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
---

# BUG-0570 — The order dispatch guard's account fingerprint collides on short keys

Found while reviewing BUG-0560 (PR #3682), where the same weakness was fixed in
the sibling function. Left out of that PR on purpose: it belongs to the file
BUG-0551 shipped.

## Symptom

`accountFingerprint` treats two different API keys as the same key whenever they
share their first two characters and their length:

```ts
if (apiKey.length <= 8) return `${apiKey.slice(0, 2)}…${apiKey.length}`;
```

`"ab…2"` is returned for `"ab"`, `"abcd"`, `"abzz"` and `"aabb"`. The dispatch
guard that BUG-0551 added compares this fingerprint to decide whether the live
context moved while a request was being signed, so a collision means a credential
change that happens mid-signing is not detected.

## Why it matters and why it is P3

The collision window is the short-credential branch, and no real venue issues an
API key of eight characters or fewer — so in practice this is unreachable with a
genuine credential. It is still worth closing:

- The guard's other signals (`accountId`, the session epoch) do not change when
  only the *key* changes within one account session, so the fingerprint is the
  only thing standing between a mid-signing key swap and a dispatch to the old
  context.
- The function is exported and reused, and the short branch is exactly what a
  test with placeholder values exercises — so a test that swaps `"key-a"` for
  `"key-b"` and expects a refusal would be asserting against a collision.

## Fix

Hash the key synchronously instead of slicing it, the way
`credentialFingerprint` in `src/stores/accountVerification.svelte.ts` now does
(FNV-1a over the material, rendered as hex plus a length). Keep
`NO_CREDENTIALS` for the absent case. Then check the guard's tests: any that
rely on two distinct placeholders producing distinct fingerprints is currently
asserting on the collision, and needs the real thing.

## Acceptance criteria

- [ ] Two different API keys of the same length never share a fingerprint
- [ ] A key change during signing is refused by the BUG-0551 dispatch guard
- [ ] The existing dispatch-guard tests still pass, and any placeholder-based
      fingerprint assertions are replaced with a collision-proof pair

## Out of scope

- Changing which signals the guard compares. That is BUG-0551's design and it
  stands.
- `credentialFingerprint` in the BUG-0560 store, which is already a hash.

## Links

- `src/services/orderGate.ts:2223-2227` — `accountFingerprint`
- `src/stores/accountVerification.svelte.ts` — `credentialFingerprint`, the shape
  to copy
- Found during the BUG-0560 review; that PR deliberately left it out of scope
