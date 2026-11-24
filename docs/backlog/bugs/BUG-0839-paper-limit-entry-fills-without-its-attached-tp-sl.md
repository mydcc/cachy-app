---
id: BUG-0839
title: A paper limit entry with TP/SL fills without its attached plans
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# BUG-0839 — A paper limit entry with TP/SL fills without its attached plans

## Symptom

On the paper account, a limit (or trigger) entry sent with `tpPrice` and/or
`slPrice` is accepted, rests, and later fills — and the position it opens has
no take-profit and no stop. The levels were part of the order the trader
placed; the position the trader ends up holding is unprotected. A market
entry with the same fields gets its plans (FEAT-0069), so the two order types
disagree about the same request.

For a bot this matters more: FEAT-0819 lets a grid place resting entries, and
any of them that relies on attached plans would run unprotected.

## Evidence

**Derived** — found in the FEAT-0819 stage 3 review (PR #4627); nobody has
reported seeing it. Three places in `src/services/paperExchange.ts` disagree:

- `PaperExchange.placeOrder` validates `tpPrice`/`slPrice` for a non-MARKET
  order (`assertTpSlLevels` against `payload.price`), so it treats the levels
  as part of the request.
- The resting `PaperOrder` it then stores carries neither price, and the type
  has no field for them (`src/stores/paperTrading.svelte.ts`, `PaperOrder`).
- `PaperExchange.settleRestingOrders` opens the position through `applyOpen`
  and `recordFill` and never calls `attachEntryPlans`; only the MARKET branch
  of `placeOrder` does.

A related, smaller gap on the same path: `settleRestingOrders` wraps each fill
in a bare `catch {}` whose comment covers "a close with no position left". It
also swallows a failure of an *opening* fill, and the order is dropped either
way (it is never pushed back into `remaining`), so a resting entry can vanish
without a fill and without a log line. Whether `applyOpen` can throw today is
unverified.

## Cause

The atomic entry-plus-plans form (FEAT-0069) was built for the market path.
The resting path predates it and was never given somewhere to keep the levels
until the fill.

## Fix

- Keep the attached levels on the resting order (the `tp*`/`sl*` fields the
  MARKET path reads from the payload), and add them to `PaperOrderSchema`.
- In `settleRestingOrders`, after an opening fill, attach the plans against
  the position the fill opened, the way the MARKET branch does — the owner
  comes from the position (FEAT-0819: a plan belongs to the owner of the
  position it protects).
- Narrow the bare `catch` to the case it documents (`PAPER_NO_POSITION` on a
  close) and log anything else instead of dropping the order silently.

Leave the venue paths alone: this is the simulator answering differently from
the exchange it models.

## Acceptance criteria

- [x] A test places a paper LIMIT entry with `tpPrice` and `slPrice`, crosses
      it with the feed, and finds both plans on the new position; it fails
      without the fix
- [x] The test passes with the fix, and the plans carry the position's owner
- [x] A resting order with stored levels survives a reload with the levels
- [x] An opening fill that throws inside `settleRestingOrders` is logged, not
      silently dropped; a close against a missing position stays quiet

## Out of scope

- Live venue behaviour for limit entries with attached plans.
- The grid runtime itself (FEAT-0819 stage 4).

## Links

- [`FEAT-0819`](../features/FEAT-0819-grid-bot-runtime-on-the-paper-account.md)
- [`FEAT-0069`](../features/FEAT-0069-bitunix-place-order-completion.md) — attached TP/SL on entry
- Code: `src/services/paperExchange.ts`, `src/stores/paperTrading.svelte.ts`
