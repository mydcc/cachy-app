---
id: FEAT-0011
title: Verify every order against displayed state before it leaves the client
type: feature
status: done
branch: claude/feat-0011-erledigen-k3fht2
priority: P0
milestone: M1
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
estimate: 5
size: L
target_date: 2026-10-05
start_date: 2026-08-01
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

- [x] Every order-placing path in the codebase reaches the exchange only
      through the gate — proven by a test that adds a call site bypassing it
      and fails
- [x] Each checked field has a test that mutates it after construction and
      asserts refusal, with the field named in the error
- [x] A refusal produces no network call at all — asserted against a mocked
      transport
- [x] Comparisons use `Decimal`; a test with values that differ only in float
      representation passes rather than falsely refusing
- [x] The gate runs with the network down
- [x] Refusal messages exist in German and English

## Out of scope

- Paper trading ([`FEAT-0012`](FEAT-0012-paper-trading-mode.md)) — separate item,
  built directly on this seam.
- The limits themselves ([`FEAT-0013`](FEAT-0013-risk-limits-and-kill-switch.md))
  — the gate calls them; it does not define them.
- Remote or four-eyes approval. ADR-0004 §3 splits it off deliberately.
- Reworking how orders are constructed. The gate wraps what exists.

## Resolved questions

- **Size tolerance** → `max(stepSize, expected × 0.1 %)`, derived per
  instrument from `marketState.symbolMeta`, never a constant. The relative
  floor covers instruments whose step is coarser than the position itself.
  A 10x sizing error is three orders of magnitude outside either bound;
  `orderGate.test.ts` asserts both directions — one step of rounding passes,
  10x refuses.
- **Where does "displayed state" come from?** → A snapshot passed explicitly
  by the call site, never a store read by the gate. The gate imports no
  store at all: `verify()` is pure, takes `{ payload, displayed }` and
  compares them.

  The DOM variant was rejected. It is the strongest form on paper, but it
  makes execution depend on render timing and on markup that changes for
  cosmetic reasons — a refactor of a results panel would start refusing
  orders. What the snapshot buys instead: a store that is corrupt in one
  place has to be corrupt in the same way, at the same instant, in both the
  payload and the snapshot to get through. Two independent derivations
  strengthen that further:
  - size for an open is re-derived from account size, risk and stop
    distance rather than read back out of the calculator's result;
  - the account (exchange + key) is re-read inside the transport at
    transmit time and compared against what the gate approved, so switching
    accounts between the click and the send refuses.
- **Account state freshness** → Fail closed. The gate is local by
  construction, so it cannot refresh; blocking-until-refreshed would put
  network I/O inside it and break the offline requirement. Leverage and
  margin mode older than 60 s refuse an `open` and name the staleness.
  Closes are deliberately exempt: a close inherits the position's own
  leverage, and refusing one because a cached read went stale would fail in
  the situation where closing matters most.

## What shipped

- `src/services/orderGate.ts` — `verify()` (pure), `submit()`,
  `assertGatePass()`, and the `registerRiskLimitCheck` /
  `registerKillSwitch` seam FEAT-0013 plugs into. The gate calls the limits;
  it does not define them, and "unregistered" means "none configured", not
  "passed".
- `src/services/tradeService.ts` — `signedRequest` refuses any
  state-mutating action without a pass, and every mutating call site
  (`flashClosePosition`, `closePosition`, `closeAllPositions`, `cancelOrder`,
  `cancelAllOrders`, `modifyOrder`, `cancelTpSlOrder`, `modifyTpSlOrder`)
  goes through `gatedRequest`. Read-only calls are untouched.
- `src/tests/architecture/order_gate_bypass.test.ts` — scans every shipped
  file under `src/` for a mutating call that skips the gate, and verifies
  the scanner against a synthetic bypassing call site in the same run so it
  cannot pass vacuously.
- `orderGate.*` refusal messages in `de.json` and `en.json`, including
  translated field names.

Passes are single-use and bound to endpoint, action, symbol and account, so
an approval cannot be replayed against a different order.

## Follow-ups

- No opening-order path exists in the client yet, so the `open` checks
  (size recomputation, leverage, margin mode, take-profit levels) are
  covered by tests but not yet exercised by a call site. FEAT-0069 is where
  they get wired up; the gate is the seam it attaches to.
- FEAT-0013 supplies the limits and the kill switch. Until it lands, both
  hooks are unregistered and the gate approves on those two checks.

## Links

- [`docs/MILESTONES.md`](../../MILESTONES.md) — M1
- [`docs/adr/0004-spacetimedb-data-scope.md`](../../adr/0004-spacetimedb-data-scope.md) §3
- `src/services/tradeService.ts` — `signedRequest`, the current transport
- `src/routes/api/orders/+server.ts` — the server-side order route
- `src/services/omsService.ts` — order tracking, where the audit trail attaches
