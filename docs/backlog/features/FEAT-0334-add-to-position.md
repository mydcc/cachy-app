---
id: FEAT-0334
title: Add to an open position and see what it does to the average entry
type: feature
status: specced
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [FEAT-0011]
parent: FEAT-0023
estimate: 3
size: M
start_date: 2026-09-02
target_date: 2026-12-14
---

# FEAT-0334 — Add to an open position and see what it does to the average entry

## Problem

Cachy can open a position and close part of it
([`FEAT-0256`](FEAT-0256-partial-close-position.md)), but it cannot increase
one. Scaling into a position — the other half of how a trader actually manages
size — means leaving the app.

Worse than the missing button is the missing number. Adding moves the average
entry, and the average entry is what every stop distance and every risk figure
in the calculator is measured from. A trader adding at the exchange has to work
out where their entry lands before deciding whether the add is survivable, and
Cachy is the tool that exists to do exactly that arithmetic.

## Proposal

An add control in the position panel: a quantity input, a preview of what the
resulting position looks like, and an order that goes out through the normal
path.

- **Reuse the quantity-input shape [`FEAT-0256`](FEAT-0256-partial-close-position.md)
  established** — slider with percentage marks plus a linked absolute field,
  one committed quantity as the single source of truth, rounded to the
  instrument's step size on commit. A second implementation of the same input
  is how the two drift apart.
- **Preview the resulting size and average entry** before the order is sent:
  `(oldAvg × oldQty + limitOrMarkPrice × addQty) / (oldQty + addQty)`, in
  `decimal.js` throughout. Native `number` here is a wrong entry price, which
  is a wrong stop distance, which is money.
- **The preview is a preview, never a stored truth.** Once the venue reports
  the position back, its average entry wins. Cachy must not persist its own
  computed figure and must not keep showing it after a fill — a locally
  computed average that quietly disagrees with the exchange is worse than no
  preview at all, because it is believed.
- **An add is an opening order, not a reduce.** It goes out as `place-order`,
  passes the full [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) gate
  — margin, size, price, account — and inherits `place-order`'s confirmation
  from [`FEAT-0024`](FEAT-0024-confirmation-policy.md)'s catalogue. No new
  catalogue key: `ConfirmableAction` in
  [`confirmationPolicy.ts`](../../../src/lib/confirmationPolicy.ts) already
  covers it, and adding a key for something the gate already enforces
  structurally would weaken it, not strengthen it.

### Why there is no matching "reduce" item

[`FEAT-0023`](FEAT-0023-position-management.md) listed the control as "add to /
reduce, average entry recomputed" and asked whether the two belong together.
They do not, and the reason is arithmetic rather than taste: **a reduce does
not move the average entry.** Closing part of a position realises PnL and
leaves the remainder's entry price exactly where it was. The recomputation the
epic named as the shared work is add-only work, and the reduce itself already
shipped as [`FEAT-0256`](FEAT-0256-partial-close-position.md).

## Acceptance criteria

- [ ] An open position can be increased from the position panel, by percentage
      or absolute size
- [ ] The quantity is rounded to the instrument's step size before it reaches
      the service, so the gate and the venue agree it is fillable
- [ ] The resulting size and average entry are previewed before sending, in
      `decimal.js`, with a test covering long and short
- [ ] The previewed average is replaced by the venue's reported figure once the
      position update arrives, and is never persisted
- [ ] The order passes the FEAT-0011 gate on the opening path, with a test that
      an add exceeding available margin is refused
- [ ] The action inherits the `place-order` confirmation rather than defining a
      new one
- [ ] The control is absent where the exchange cannot support it, per
      [`FEAT-0017`](FEAT-0017-exchange-capability-model.md)
- [ ] German and English strings

## Out of scope

- **Reducing a position** — [`FEAT-0256`](FEAT-0256-partial-close-position.md).
- **Averaging down as a strategy.** This is an input, not advice; Cachy shows
  the number and does not suggest the trade.
- **Recomputing stops or take-profits to follow the new entry.** Whether an
  existing TP/SL should move when the entry does is a separate decision with
  its own risk, and it belongs to whoever specs it.

## Open questions

- **Does the preview show a new liquidation price as well?** It is the number a
  trader most wants next to a new average entry, but only if the risk engine
  already exposes an estimate that matches what the venue will report. A
  liquidation figure that is close but wrong is a hazard, not a feature —
  decide before building the preview, not after.

## Links

- [`FEAT-0023`](FEAT-0023-position-management.md) — the epic this belongs to
- [`FEAT-0256`](FEAT-0256-partial-close-position.md) — the quantity input to reuse
- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) — the gate every action passes
- [`FEAT-0024`](FEAT-0024-confirmation-policy.md) — `place-order` confirmation
- `src/lib/confirmationPolicy.ts` — `ConfirmableAction`
- `src/services/tradeService.ts` — order placement
