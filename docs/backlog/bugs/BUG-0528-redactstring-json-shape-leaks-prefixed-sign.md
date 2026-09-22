---
id: BUG-0528
title: redactString leaves prefixed sign spellings unredacted in embedded JSON
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

# BUG-0528 — `redactString` leaves prefixed sign spellings unredacted in embedded JSON

Follow-up to BUG-0497 (code review finding on PR #3571, accepted as non-blocking there).
Lands in PR #3571 together with BUG-0497 — one PR, no fix-then-hope split.

## Symptom

`redactString('{"x-api-sign": "SECRET"}')` returns the input unchanged — the
exchange signature survives in clear in any log line carrying an embedded JSON
envelope. The `key=value` shape already redacts the same spelling
(`x-api-sign=SECRET` → `x-api-sign=***REDACTED***`), so two shapes of the same
secret disagree about whether it is secret.

## Evidence

**Demonstrated** — reviewer-verified on PR #3571 (`d23ce2e`), reproducible by
calling `redactString` with the inputs below.

- `src/utils/redact.ts` — the JSON alternative accepts the bare word `sign`
  as the *whole* key, so `"x-api-sign"` never matches:
  `/(["'])([\w-]*(?:…keywords…)[\w-]*|sign)\1(\s*:\s*)(["'])(?:[^"'\\]|\\.)*\4/gi`
- `x-api-sign=SECRET` is redacted while `"x-api-sign": "SECRET"` is not.

## Cause

The `sign` alternative in the JSON shape is a whole-key literal, unlike the
`key=value` shape where a word boundary lets it match the trailing segment of
a prefixed key.

## Fix

Extend the JSON shape's `sign` alternative to the same segment-bounded form
BUG-0497 established for `isSensitiveKey`: an optional `[\w-]*[-_]` prefix
and an optional `[-_][\w-]*` suffix around `sign`. Redacts `sign`,
`x-api-sign`, `ACCESS-SIGN`, `api-sign`; still passes `signal`, `assigned`,
`designation` through untouched.

Leave the `key=value` shape alone — it already redacts the prefixed
spellings, and touching it risks regressions for no gain. Leave the capture
groups as they are (finding 2 on PR #3571, explicitly out of scope).

## Acceptance criteria

- [ ] A test reproduces the defect and fails without the fix
- [ ] `"x-api-sign": "SECRET"`, `"ACCESS-SIGN": "SECRET"` and `"api-sign": "SECRET"` are redacted
- [ ] `"sign": "SECRET"` is still redacted
- [ ] `"signal"`, `"assigned"` and `"designation"` values pass through untouched
- [ ] The test passes with the fix

## Out of scope

- `isSensitiveKey` / `redactDeep` (fixed by BUG-0497, same PR #3571)
- Non-capturing group cleanup (LOW finding on PR #3571, no behaviour change)
- Any other `redactString` shape (URL authority, `key=value`)

## Links

- Found on BUG-0497 (`docs/backlog/bugs/BUG-0497-x-api-sign-escapes-redaction.md`), fixed together in PR #3571 (`Fixes #3487`, `Fixes #3576`)
