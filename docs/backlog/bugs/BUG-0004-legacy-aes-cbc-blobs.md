---
id: BUG-0004
title: Legacy AES-CBC credential blobs may decrypt to silent garbage
type: bug
status: specced
priority: P1
milestone: M0
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
---

# BUG-0004 — Legacy AES-CBC credential blobs may decrypt to silent garbage

## Symptom

A credential encrypted before the Web Crypto rewrite may fail to decrypt — and
because AES-CBC has no authentication tag, it fails by returning garbage rather
than by throwing.

## Evidence

**Derived, traced through git history.** Full analysis:
[`../../TODO.md`](../../TODO.md) item 12.

The pre-`560a15c7` CryptoJS implementation tried three PBKDF2 configurations in
order, ending with `{ iter: LEGACY_ITERATIONS, hash: "SHA-1" }`. The rewrite
kept the `AES-CBC` blob tag as the legacy marker but dropped the
iteration-count fallback: `attemptDecrypt()` always derives at
`STRONG_ITERATIONS` (600000). `LEGACY_ITERATIONS` (10000) and `IV_SIZE_CBC` are
declared and never read.

`encrypt()` only produces `AES-GCM` today, so this affects only pre-rewrite
blobs a user still carries — an old exported backup, or `localStorage` never
re-saved since. The file's own comment on `decrypt()` already notes that a wrong
key on AES-CBC returns garbage instead of throwing.

Not demonstrated against a real legacy blob, because no such blob was available.

## Fix

Either restore the `LEGACY_ITERATIONS` retry inside the `AES-CBC` branch — same
fallback order as the original, via `crypto.subtle.deriveKey` — or confirm no
production blob still uses the old iteration count and delete both constants as
confirmed dead.

This is Klasse-A credential decryption. It needs a test built from a real
legacy blob, not a guess at the missing fallback's shape.

## Acceptance criteria

- [ ] A fixture blob is produced at the legacy parameters and committed as test
      data
- [ ] A test decrypts it and fails against the current implementation
- [ ] The fix makes it pass, and AES-GCM blobs are unaffected
- [ ] Garbage output is detectable rather than silently returned — decide and
      implement a plaintext sanity check for the CBC path
- [ ] If the alternative is chosen instead, this item records the evidence that
      no legacy blob remains, and both constants are removed

## Links

- [`docs/TODO.md`](../../TODO.md) item 12
- `src/services/cryptoService.ts` — `attemptDecrypt()`
