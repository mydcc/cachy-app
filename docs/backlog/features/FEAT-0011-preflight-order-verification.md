---
id: FEAT-0011
title: Verify every order against displayed state before it leaves the client
type: feature
status: specced
priority: P0
milestone: M1
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# FEAT-0011 — Verify every order against displayed state before it leaves the client

## Problem

Cachy can place orders. Nothing sits between the code that builds an order
payload and the code that transmits it, so any defect anywhere upstream — a
stale store, a rounding error, a race between a price update and a click, a
mis-serialised `Decimal`, a wrong-account selection — becomes a real order at
an exchange with real money behind it.

The repository already contains evidence that this class of defect occurs and is
hard to see: an order-serialisation float bug, a force-reconnect that silently
skipped the authenticated socket, order IDs corrupted by `response.json()`.
Each was found by reading code, not by the system refusing a bad order — because
the system has no way to refuse one.

This is commitment 2 in [`VISION.md`](../../VISION.md), and it is the
precondition for the community getting execution at all and for an AI ever
getting it.

## Proposal

A single mandatory gate between order construction and transport.

**The gate recomputes rather than inspects.** It takes the order payload and the
UI state it is supposed to represent, independently derives what the order
should be, and compares. A check that reads the same variable the payload was
built from proves nothing; the value has to be derived a second way.

Checked, at minimum:

- symbol and side match the active symbol and the user's selection
- size matches a fresh calculation from account size, risk and stop distance,
  within a stated tolerance
- entry, stop and every take-profit level match the displayed values exactly,
  compared as `Decimal`
- leverage, margin mode and position mode match the account's actual state, not
  what the UI last cached
- the target account is the one shown as active
- the order is inside the limits from [`FEAT-0013`](FEAT-0013-risk-limits-and-kill-switch.md)
- the kill switch is not engaged

**On mismatch it refuses and says which field disagreed and by how much.** It
never corrects the order and silently proceeds — a gate that repairs its input
is a second source of orders.

**It is structurally unavoidable.** Not a function that call sites are supposed
to call: the transport is only reachable through it. The test in the acceptance
criteria is what makes this real rather than aspirational.

**It is local.** No network, no server, works offline — ADR-0004 §3 decides this
explicitly. The remote four-eyes variant is a separate, much later feature.

## Acceptance criteria

- [ ] Every order-placing path in the codebase reaches the exchange only
      through the gate — proven by a test that adds a call site bypassing it
      and fails
- [ ] Each checked field has a test that mutates it after construction and
      asserts refusal, with the field named in the error
- [ ] A refusal produces no network call at all — asserted against a mocked
      transport
- [ ] Comparisons use `Decimal`; a test with values that differ only in float
      representation passes rather than falsely refusing
- [ ] The gate runs with the network down
- [ ] Refusal messages exist in German and English

## Out of scope

- Paper trading ([`FEAT-0012`](FEAT-0012-paper-trading-mode.md)) — separate item,
  built directly on this seam.
- The limits themselves ([`FEAT-0013`](FEAT-0013-risk-limits-and-kill-switch.md))
  — the gate calls them; it does not define them.
- Remote or four-eyes approval. ADR-0004 §3 splits it off deliberately.
- Reworking how orders are constructed. The gate wraps what exists.

## Open questions

- **Size tolerance.** Exchange step sizes force rounding, so an exact match will
  reject valid orders. The tolerance has to be derived from the instrument's
  step size rather than picked as a constant — and it must be tight enough that
  a 10x sizing error cannot pass.
- **Where does "displayed state" come from?** If the gate reads the same store
  the payload was built from, a corrupted store passes both. Deriving from the
  rendered DOM is the strongest form and the most brittle; deriving from a
  separately maintained snapshot is weaker and practical. Decide before
  building — it determines what this item is actually worth.
- **Account state freshness.** Leverage and margin mode must be checked against
  the exchange's truth, which may be stale. Fail closed on stale state, or block
  until refreshed?

## Links

- [`docs/MILESTONES.md`](../../MILESTONES.md) — M1
- [`docs/adr/0004-spacetimedb-data-scope.md`](../../adr/0004-spacetimedb-data-scope.md) §3
- `src/services/tradeService.ts` — `signedRequest`, the current transport
- `src/routes/api/orders/+server.ts` — the server-side order route
- `src/services/omsService.ts` — order tracking, where the audit trail attaches
