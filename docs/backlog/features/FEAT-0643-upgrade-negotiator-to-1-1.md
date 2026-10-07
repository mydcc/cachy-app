---
id: FEAT-0643
title: Upgrade negotiator 0.6 to 1.1 and adapt the precompressed-asset selection call
type: feature
status: in-progress
priority: P3
assignee: opencode
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
---

Branch: `chore/negotiator-1`

## Problem

`negotiator` sat at `^0.6.4` (2019-era) with 1.1.0 available. It is a real
direct dependency — `server-precompressed.js` imports it — so unlike FEAT-0642
this is a genuine upgrade, and the major version carries a breaking change to
the API we call.

### The break: `encoding()` second argument

`server-precompressed.js` passed the server's variant order as the second
argument to `Negotiator#encoding()`:

```js
new Negotiator(req).encoding(Object.keys(available), Object.keys(available));
```

In 0.6.x that argument *is* the preference list. Since 1.0 it is an **options
object**, and the preference moved to `.preferred`. The underlying
`preferredEncodings(accept, provided, preferred)` function is unchanged, so
passing a bare array does not throw — an Array simply has no `.preferred`, the
preference becomes `undefined`, and negotiator falls back to its pure
spec-based comparator. The failure is silent.

### Measured effect

Both versions were available in the tree simultaneously, so this was compared
rather than assumed. With `available = ['br', 'gzip']`:

| `Accept-Encoding` | 0.6.4 (current) | 1.1.0, bare array | 1.1.0, `{ preferred }` |
| --- | --- | --- | --- |
| `gzip, deflate, br` | `br` | **`gzip`** | `br` |
| `gzip;q=1, br;q=1` | `br` | **`gzip`** | `br` |
| `br, gzip` | `br` | `br` | `br` |
| `*` | `br` | `br` | `br` |
| absent | `null` | `null` | `null` |

`gzip, deflate, br` is what Chrome sends. The unfixed upgrade would have served
gzip to every browser while still setting `Content-Encoding: gzip` correctly —
no error, no failed test other than the one already in the suite, just a silent
loss of brotli's better compression on every asset.

## What was verified

- Upgrade installed and the **existing** test caught it: `prefers brotli when
  the client accepts it` went red with `expected { suffix: '.gz', encoding:
  'gzip' } to deeply equal { suffix: '.br', encoding: 'br' }`. That test was
  written in #3799 for the `q=0` regression and happened to cover the browser's
  real header; this is what the suite was for.
- `selectVariant` now passes `{ preferred: variants }`, restoring exact parity
  with 0.6.4 on all five cases above.
- Added `breaks q-value ties by server preference, not by header order` to pin
  the *mechanism* rather than one header string. Proven red: reverting the call
  to the bare array fails both tie tests with the same assertion, then passes
  again with the fix.
- `server-precompressed.test.js`, `server-headers.test.js`,
  `release-guard.test.js`: 78 tests green.
- `npm run build` green.

## Notes

- `compression@1.8.2` (latest) pins `negotiator: ~0.6.4`, so the tree now holds
  two copies: 1.1.0 at top level for us, 0.6.4 nested under `compression`. The
  duplication is unavoidable — compression has no release that moved off 0.6.x.
- negotiator 1.1.0 ships no TypeScript types (no `index.d.ts`, no `types`
  field). This is a non-issue here: the root `tsconfig.json` includes only
  `src/**`, so the `@param {import('negotiator')...}` JSDoc in
  `server-precompressed.js` is documentation, not a checked type.

## Acceptance criteria

- [x] `negotiator` at `^1.1.0`
- [x] `selectVariant` passes `{ preferred }`, not a bare array
- [x] q-value ties still resolve by server variant order
- [x] root server test files green (78 tests)
- [x] `npm run build` green
- [ ] `npm test` green — CI

## Out of scope

`lightweight-charts-indicators` 0.5 → 0.9 (needs visual acceptance),
`conventional-changelog-conventionalcommits` (blocked, BUG-0639), TypeScript 7
(blocked until 7.1).