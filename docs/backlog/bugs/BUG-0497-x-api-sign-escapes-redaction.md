---
id: BUG-0497
title: The x-api-sign header escapes isSensitiveKey because the sign pattern is anchored
type: bug
status: done
priority: P3
assignee: opencode
branch: fix/BUG-0497-x-api-sign-redaction
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: ADR-0013
depends_on: []
---

# BUG-0497 — `x-api-sign` escapes redaction

## Symptom

`isSensitiveKey("sign")` is `true`. `isSensitiveKey("x-api-sign")` is `false`.

The header Cachy actually transmits is the second spelling, so a log or error
report that dumps request headers prints the exchange signature in clear, while
the same value under the key `sign` would be masked.

Scope honestly stated: the signature is a MAC, not a secret — it cannot be
reversed into the API secret. What a captured envelope permits is **replay**
within the venue's `recvWindow`: `x-api-sign` plus `x-api-timestamp`,
`x-api-nonce` and the body is a complete, re-sendable request. That is a real
but bounded exposure, which is why this is P3 and not higher.

## Evidence

**Derived, from reading the code.** `src/utils/redact.ts:59`:

```typescript
const SENSITIVE_PATTERNS: RegExp[] = [
    /passw(or)?d/i,
    /passphrase/i,
    /secret/i,
    /token/i,
    /api[-_]?key/i,
    /signature/i,
    /authorization/i,
    /bearer/i,
    /^private[-_]?key$/i,
    /^sign$/i,          // anchored — matches "sign", not "x-api-sign"
];
```

Neither pattern reaches it: `/^sign$/i` is anchored at both ends, and
`/signature/i` needs the full word, which `x-api-sign` is not.

Every other envelope field *is* covered: `x-api-key` matches `/api[-_]?key/i`
and `x-api-passphrase` matches `/passphrase/i` (both unanchored). The signature
is the one field that falls through, which is what makes this look like an
oversight rather than a decision.

The outbound spellings are safe by accident: `bitunixCallHeaders` emits the key
`sign` (matches the anchored pattern) and `bitgetCallHeaders` emits
`ACCESS-SIGN` — which also does **not** match, so the Bitget side leaks on both
legs.

## Cause

`/^sign$/i` was anchored to avoid false positives on ordinary words containing
"sign" — `signal`, `assigned`, `designation`. The anchor does that job and also
excludes every prefixed spelling of the real header.

## Fix

Replace the anchored pattern with one that matches the header spellings without
matching ordinary words — the segment-bounded form:

```typescript
/(^|[-_])sign($|[-_])/i,
```

This matches `sign`, `x-api-sign`, `ACCESS-SIGN` and `api-sign`, and still
rejects `signal`, `assigned`, `designation`.

Add the three real spellings to the redaction test as fixtures, so the next
tightening of this pattern cannot silently drop one.

## Acceptance criteria

- [ ] `isSensitiveKey` returns `true` for `x-api-sign`, `ACCESS-SIGN`, `sign`
- [ ] It still returns `false` for `signal`, `assigned`, `designation`
- [ ] A test fails without the fix
- [ ] `SAFE_KEYS` still wins where it applies — no existing safe key is masked

## Links

- `docs/adr/0013-*` — the envelope whose fields these are
- `src/utils/server/presignedEnvelope.ts` — where the header names are defined
