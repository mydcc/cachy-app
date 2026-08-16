---
id: BUG-0215
title: Gate refusals render raw placeholders and refuse every paper order
type: bug
status: done
branch: claude/feat-0011-erledigen-k3fht2
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
---

# BUG-0215 — Gate refusals render raw placeholders and refuse every paper order

## Symptom

Three faults, found from one user report of this toast:

> Order refused: the account state ({field}) is {age}s old, older than the
> {max}s limit. Refresh it and try again.

1. **Untranslated placeholders.** Every gate refusal shown by the order panel
   arrives with `{field}`, `{age}` and `{max}` literal. The message names
   nothing and the trader cannot tell how stale the read was.
2. **The advice is impossible to follow.** Nothing in the UI refreshes the
   account state. It is stamped only when `app.ts` fetches on a symbol change,
   so a panel left open for a minute refuses every order and offers no way out
   short of switching symbols and back.
3. **Paper trading cannot place anything.** `remoteAccountStateAt` is stamped
   only by a successful Bitunix leverage read, which needs real API keys.
   In paper mode there are none, so the timestamp is never set, the age is
   infinite, and **every simulated order is refused** — the opposite of what a
   practice mode is for.

## Evidence

**Demonstrated** for (1) — the reported toast is the `orderGate.stale` template
with nothing substituted.

**Derived** for (2) and (3), from two pieces of code that disagree:

- `tradeService.fetchLeverageMarginMode` (`src/services/tradeService.ts:232`)
  returns before stamping unless the provider is Bitunix *and* both key and
  secret are present, and is called only from `app.ts:631` on symbol change.
- `orderGate.checkAccountState` (`src/services/orderGate.ts:696`) refuses any
  `open` whose `accountStateAt` is absent or older than
  `MAX_ACCOUNT_STATE_AGE_MS`, with no exemption for paper mode.

All three now have tests that fail without the fix.

## Cause

(1) is a lost value bag. The gate exposes `translateRefusal`, which fills the
placeholders and translates the field name, and `errorUtils.getDisplayMessage`
uses it. But `orderPlacementService` caught `OrderRefusedError` and kept only
`refusal.messageKey`, discarding `refusal.values`; `PlaceOrderPanel` then
translated that bare key. The renderer was right there and the data never
reached it.

(2) and (3) are the same omission seen from two sides: FEAT-0021 wired the
panel to a freshness requirement without wiring anything that satisfies it.

## Fix

- `PlacementResult` carries `refusal?: OrderRefusal` whole, and the panel
  renders it through `translateRefusal`.
- The panel re-reads leverage/margin mode before submitting when the stamp is
  stale. A *failed* read still leaves the old timestamp, so the gate refuses
  rather than being talked round — the refresh is an attempt, not an override.
- `checkAccountState` returns `null` when `displayed.paperMode === true`.

**Left alone:** every other gate check. Paper orders still go through size
recomputation, the kill switch and the risk limits — only the staleness check
is exempt, and only because there is no remote account for a simulated order to
be stale relative to. A live order cannot reach the exemption by claiming to be
paper: `displayedAccount()` sets the flag from `paperState` and callers cannot
supply it, and `assertGatePass` re-reads the real mode at transmit time and
refuses a pass whose `paperMode` disagrees.

## Acceptance criteria

- [x] A test reproduces the defect and fails without the fix
- [x] The test passes with the fix
- [x] A rendered refusal contains no `{` placeholder
- [x] A paper order with no account read is approved
- [x] A live order with no account read is still refused
- [x] The stale refusal names the age and the limit

## Links

- [`FEAT-0021`](../features/FEAT-0021-order-types.md) — shipped the panel that
  exposed all three
- [`FEAT-0011`](../features/FEAT-0011-preflight-order-verification.md) — the gate
- [`FEAT-0012`](../features/FEAT-0012-paper-trading-mode.md) — paper mode
