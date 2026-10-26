---
id: BUG-0727
title: Security: defense-in-depth hygiene (error leakage, token attachment, sanitizer cleanup, CSV validation, gitignore)
type: bug
status: done
assignee: opencode
priority: P3
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
---

# BUG-0727 — Security: defense-in-depth hygiene

> **State note.** Fixed on `fix/security-defense-in-depth` (worktree
> `.worktrees/sec-audit-2`, PR pending). Dispositions:
>
> 1. **Market-data error bodies** — `marketDataErrorResponse` keeps the upstream
>    status but returns our `Upstream market data request failed` and logs the
>    raw body server-side. Used by funding-rate, position-tiers, trading-pairs,
>    tickers and bitget/contracts. Klines keeps its own catch with a fixed
>    message and the upstream status. Tickers keeps its own `Symbol not found`
>    404. The AI routes were already converted in BUG-0724; CMC and news were
>    converted here too.
> 2. **Token attachment** — `appAuthHeaders(extra, requestUrl)` attaches
>    `x-app-access-token` only to a relative, same-origin or network-path
>    same-origin target; an absolute foreign URL gets no token. `appFetch`
>    passes the URL on both attempts.
> 3. **sanitizer.ts** — already clean: one `sanitizeHtml` declaration in 53
>    lines. The audit finding described an older revision; verified, no change.
> 4. **CSV import** — `normalizeTradeType` accepts only `long`/`short` (an
>    unknown row is dropped by the existing per-row guard);
>    `safeScreenshotUrl` drops anything that is not `http(s):`, so a
>    `javascript:`/`data:` value cannot reach `<img src>`.
> 5. **.gitignore** — `*.pem`, `*.key`, `*.crt`, `*.p12`, `credentials.json`,
>    `secrets.*`.
> 6. **JSON-LD** — `serializeJsonLd` escapes `<`, `>`, `&`, U+2028/U+2029; the
>    layout uses it for the structured-data block.
> 7. **ToastItem** — `toastIcon` is an own-property allowlist over the four
>    static icons, with the info icon as fallback; `constructor`/`__proto__`
>    cannot reach the HTML sink.
> 8. **Health endpoint** — the `environment` field is gone; an unauthenticated
>    scanner no longer learns whether the host is development.
> 9. **Locked-session openrouterApiKey** — already fixed in BUG-0721.
>
> Review round: the same-origin check now parses before classifying (leading
> whitespace and backslashes are cross-origin), and `requestUrl` is required.
> The error boundary logs through the patched console, because `logger` only
> feeds the authenticated SSE stream. CMC and news no longer forward upstream
> bodies. CSV accepts `buy`/`sell` aliases, warns with the row number, and
> stores the normalized screenshot URL. `.gitignore` anchors the secret pattern.
> Tests now pin the six-route boundary, the `appFetch` URL hand-off, the health
> payload, and the layout/toast wiring.
>
> Residual: `rss-fetch` and `article-content` still return extractor messages
> (not part of the listed market/AI proxies); a venue 200 error envelope passes
> through unchanged; the tracked `.npmrc` was left alone.
>
> Verification: 88 tests across the changed routes/helpers, `tsc --noEmit`
> clean, ESLint clean, translation check passes, `npm run backlog:check` — 613
> items valid. RED proofs: the cross-origin token test, the invalid trade-type
> row and the `javascript:` screenshot fail with the old code restored.

## Symptom

Low-severity hygiene findings from the security audit:

1. **Upstream error bodies reflected verbatim**: Market data proxy routes (funding-rate, position-tiers, tickers, trading-pairs, bitget/contracts) forward raw upstream error text. AI proxy routes return raw exception messages.

2. **Client access token leaks to absolute external URLs**: `appAuthHeaders` unconditionally attaches `x-app-access-token` to every request including cross-origin.

3. **Sanitizer file polluted**: `src/lib/utils/sanitizer.ts` has hundreds of duplicate `sanitizeInput` declarations obscuring real implementations.

4. **CSV import lacks field validation**: `tradeType` not validated against allowed set; `screenshot` not scheme-checked (could carry `javascript:`/`data:` URLs).

5. **`.gitignore` lacks explicit secret-file patterns**: No `*.pem`, `*.key`, `*.crt`, `credentials.json` entries.

6. **JSON-LD doesn't escape `<`**: `JSON.stringify` in `+layout.svelte` doesn't escape `<`/`>`, potential script-tag breakout if i18n string contains `</script>`.

7. **ToastItem unsanitized property lookup**: `{@html icons[toast.type]}` without runtime validation.

8. **Health endpoint discloses environment**: Reports `'development'` when NODE_ENV unset.

9. **Locked-session retains openrouterApiKey** (also in BUG-0721, listed here for tracking).

## Evidence

**Demonstrated** — all defects follow from reading the code. Fingerprints: `marketProxy:errorBody:verbatimReflection`, `ai:proxy:errorBodyLeakage`, `appAuth:tokenLeak:crossOriginAttachment`, `csv:import:unvalidatedFields`, `toast:icon:unsanitizedLookup`

## Fix

1. Return generic error messages with upstream status code only; log raw body server-side.
2. Only attach token when input is relative or same-origin.
3. Clean up `sanitizer.ts`: one declaration per function, remove duplicates.
4. Validate `tradeType` against enum; reject non-http(s) `screenshot` values.
5. Add `*.pem`, `*.key`, `*.crt`, `*.p12`, `credentials.json`, `secrets.*` to `.gitignore`.
6. Escape `<`, `>`, `&` in JSON-LD output.
7. Use explicit allowlist lookup in ToastItem.
8. Omit or gate environment field in health endpoint.

## Acceptance criteria

- [x] No upstream error text forwarded to clients
- [x] Token only attached to same-origin URLs
- [x] sanitizer.ts has single declaration per function
- [x] CSV import validates tradeType and screenshot scheme
- [x] .gitignore covers secret file patterns
- [x] JSON-LD escapes HTML-special characters
- [x] ToastItem uses explicit allowlist
- [x] Regression tests where applicable

## Links

Security audit run-1: `~/security-audit-skill/cachy-app/run-1/`
