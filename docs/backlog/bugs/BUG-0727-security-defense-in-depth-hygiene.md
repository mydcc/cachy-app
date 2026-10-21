---
id: BUG-0727
title: Security: defense-in-depth hygiene (error leakage, token attachment, sanitizer cleanup, CSV validation, gitignore)
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
---

# BUG-0727 — Security: defense-in-depth hygiene

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

- [ ] No upstream error text forwarded to clients
- [ ] Token only attached to same-origin URLs
- [ ] sanitizer.ts has single declaration per function
- [ ] CSV import validates tradeType and screenshot scheme
- [ ] .gitignore covers secret file patterns
- [ ] JSON-LD escapes HTML-special characters
- [ ] ToastItem uses explicit allowlist
- [ ] Regression tests where applicable

## Links

Security audit run-1: `~/security-audit-skill/cachy-app/run-1/`
