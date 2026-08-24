---
id: BUG-0004
title: Legacy AES-CBC credential blobs may decrypt to silent garbage
type: bug
status: done
priority: P1
milestone: M0
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
start_date: 2026-08-01
target_date: 2026-08-13
size: S
estimate: 2
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

- [x] A fixture blob is produced at the legacy parameters and committed as test
      data
- [x] A test decrypts it and fails against the current implementation
- [x] The fix makes it pass, and AES-GCM blobs are unaffected
- [x] Garbage output is detectable rather than silently returned — decide and
      implement a plaintext sanity check for the CBC path
- [ ] ~~If the alternative is chosen instead, this item records the evidence
      that no legacy blob remains, and both constants are removed~~ — not
      taken; the retry was restored instead

## Resolution

Restored the `LEGACY_ITERATIONS` retry that commit `560a15c7` dropped.
`attemptDecrypt()` now takes an `iterations` parameter (default
`STRONG_ITERATIONS`), and `decrypt()`'s `AES-CBC` branch loops through the
same three PBKDF2 configurations the old CryptoJS implementation tried, in
the same order: `{STRONG_ITERATIONS, SHA-256}` → `{STRONG_ITERATIONS,
SHA-1}` → `{LEGACY_ITERATIONS, SHA-1}`, returning on the first one that
succeeds.

Also closed the silent-garbage gap named in the acceptance criteria:
`attemptDecrypt()` decodes the decrypted buffer with `new
TextDecoder("utf-8", { fatal: true })` and rethrows as an `OperationError`
on failure. AES-CBC's PKCS7 padding check alone lets roughly 1 in 256 wrong
keys through undetected; every plaintext this service ever produces is
`TextEncoder`-encoded UTF-8, so a fatal decode catches that remainder
without needing to know anything about the plaintext's shape (JSON vs. a
raw string).

Fixture: `src/services/__fixtures__/legacy-aes-cbc-blob.json`, a blob
encrypted directly with `crypto.subtle` at `LEGACY_ITERATIONS` (10000) and
SHA-1 — the oldest configuration the pre-rewrite fallback chain used, and
the one most likely to still be silently mis-decrypted. Verified by
`src/services/cryptoService.test.ts` ("legacy AES-CBC blobs (BUG-0004)"):
one test decrypts the fixture and asserts the exact plaintext, one asserts
a wrong password on the same blob throws rather than resolving, one
round-trips an `AES-GCM` blob through the same password-based path to show
it's unaffected, and one mocks `subtle.decrypt` to return non-UTF-8 bytes
to exercise the sanity check directly, independent of AES padding luck.
Confirmed the first two tests fail against the pre-fix code (`bad decrypt`
and a silently-resolved `'����'` respectively) before
applying the fix. `npm run check` and the full `cryptoService`/
`backupService`/`settings.security` test files pass afterward.

## Links

- [`docs/TODO.md`](../../TODO.md) item 12
- `src/services/cryptoService.ts` — `attemptDecrypt()`, `decrypt()`
- `src/services/cryptoService.test.ts` — `describe("CryptoService — legacy
  AES-CBC blobs (BUG-0004)")`
- `src/services/__fixtures__/legacy-aes-cbc-blob.json`

## What shipped

Shipped in 1.2.0-beta.15.
