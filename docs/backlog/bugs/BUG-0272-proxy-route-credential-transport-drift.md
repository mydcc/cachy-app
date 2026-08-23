---
id: BUG-0272
title: Proxy routes drift on credential transport schema validation and error redaction
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
size: M
estimate: 3
---

# BUG-0272 — Proxy routes drift on credential transport schema validation and error redaction

## Symptom

Two inconsistencies in how exchange credentials travel through Cachy's own
proxy routes:

1. **Transport:** `PortfolioInputs.svelte`,
   `PositionsSidebar.svelte`, and `CandleChartView.svelte` send
   `apiKey`/`apiSecret` inside JSON request bodies, while
   `tradeService.signedRequest` (~L226–232) correctly transports them in
   headers. Bodies are cached/logged/replayed far more readily than headers
   by intermediaries and logging middleware.
2. **Validation & redaction:** `/api/orders` validates with a Zod schema and
   redacts credentials from error logs meticulously — but
   `/api/balance` has no Zod schema, and `balance` (~L52),
   `positions` (~L116), and `sync` (~L77) log errors via raw
   `console.error`, which the global interceptor forwards into the logger /
   SSE stream.

Today this is *mitigated* (upstream exchange errors rarely echo secrets, and
the logger's key-pattern matching catches some shapes) — it is hygiene debt
that becomes a leak the first time someone logs a request body or an upstream
error echoes a credential.

## Evidence

**Derived** from code inspection during the 2026-08-23 identity audit. No
observed secret leakage yet; both halves are structural inconsistencies
against the standards the orders route already set.

## Cause

The routes grew separately; the orders route was hardened (cf. earlier
security items) but the balance/positions/sync siblings and the three
body-based call sites were never migrated.

## Fix

- Migrate the three components onto header transport via `tradeService`.
- Bring `/api/balance`, `/api/positions`, `/api/sync` up to the orders
  route's standard: Zod request schema plus explicit redacting error logger.
- Leave `/api/orders` untouched — it is the reference implementation.

## Acceptance criteria

- [ ] No component sends `apiSecret` in a JSON body (grep/test enforced)
- [ ] All four proxy routes reject schema-invalid requests with 400 and
      emit redacted error logs on upstream failure (test asserts no
      key-shaped material appears in captured logs)
- [ ] Existing behavior of balance/positions/sync panels unchanged
      (component tests stay green)
- [ ] `npm run check` and the affected tests pass

## Out of scope

The architectural end-state question — sign client-side vs sanction the
proxy hop — is FEAT-0285
(`docs/backlog/features/FEAT-0285-credential-transit-boundary.md`,
part of PR #2194; ADR required). This item only removes today's
inconsistencies within the current architecture; whichever way FEAT-0285
decides, these gaps should be closed first.

## Links

- `src/components/inputs/PortfolioInputs.svelte`
- `src/components/shared/PositionsSidebar.svelte`
- `src/lib/windows/implementations/CandleChartView.svelte`
- `src/routes/api/balance/+server.ts`, `src/routes/api/positions/+server.ts`,
  `src/routes/api/sync/+server.ts`
- Reference: `src/routes/api/orders/+server.ts`
- Security audit 2026-08-23 (identity & access review), findings
  "inconsistent credential transport" and "unredacted route error logging"
