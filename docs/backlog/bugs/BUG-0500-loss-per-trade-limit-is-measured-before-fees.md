---
id: BUG-0500
title: The per-trade loss limit is measured before fees, so the loss it permits is always larger than the one configured
type: bug
status: done
assignee: opencode
branch: fix/paket-d-limits-close
priority: P2
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
---

# BUG-0500 — The per-trade loss limit is measured before fees

## Symptom

A trader sets **Max loss per trade = 100 USDT** and sizes a position so the
stop is worth exactly 100. The gate accepts it. The stop fills. The account is
down noticeably more than 100 — on a large notional, meaningfully more.

The limit is not wrong by an unknown amount. It is wrong by the round-trip fee,
every time, in the same direction: the permitted loss is always larger than the
configured one, never smaller.

## Evidence

**Derived, from reading the code.** `src/services/rmsService.ts:370`:

```typescript
const loss = entryPrice.minus(stopLossPrice).abs().times(qty);
if (loss.gt(max)) return limitRefusal("maxLossPerTrade", max, loss);
```

`qty × stop distance` is the price move alone. The entry fee is already paid
when the stop triggers, and the exit fee is charged on the way out; neither
appears in `loss`.

The comment immediately above states the omission and then argues it away:

> *The loss the stop would realise, before fees. Fees make the real loss
> larger, so this is the conservative direction to be wrong in only if it
> under-reports — it does not, because a stop that fills worse than its trigger
> is a slippage question, not a sizing one.*

The first clause is correct and is the finding: fees make the real loss larger,
so computing without them **under-reports**. The sentence then asserts it does
not under-report, on the grounds that slippage is a separate concern — which is
true of *slippage* and says nothing about *fees*. Two different sources of
"worse than the trigger price" have been collapsed into one, and the one that
was actually dismissed is not the one that was omitted.

Concretely, at a 0.06% taker rate on both legs with a 50,000 USDT notional: the
gate measures 100 and permits it; the trade realises 100 + 30 + 30 = 160. The
configured limit is exceeded by 60%.

That the codebase knows how to do this correctly elsewhere is the strongest
evidence it is an oversight rather than a decision. `src/lib/calculators/core.ts`
carries a break-even helper built for exactly this asymmetry, and its own
comment names the failure being repeated here:

> *FEAT-0253: the two legs can carry different rates — a limit entry is a maker
> fill while the exit is assumed taker … Using one rate when the legs actually
> differ would put break-even on the optimistic side of the truth, which is the
> failure this whole item exists to stop.*

`checkLossPerTrade` puts the limit on the optimistic side of the truth for the
same reason, one rate short.

## Cause

The limit measures the *trade idea* (how far is the stop) rather than the
*outcome* (what leaves the account). Those agree only when fees are zero.

`JournalEntry` already carries `fees`, and the entry type carries
`remoteMakerFee` / `remoteTakerFee`, so the inputs exist; the limit simply does
not ask for them.

## Fix

Include the round-trip fee in the measured loss, using the per-leg rates
FEAT-0253 established rather than a single flat rate:

```
loss = |entry − stop| × qty
     + entry notional × entryFeeRate
     + stop notional  × exitFeeRate
```

The exit leg at a stop is a taker fill; the entry leg depends on the order type
the intent carries, which is already available on the intent rather than needing
to be guessed.

Follow the file's own convention for a missing input: if a fee rate cannot be
resolved, return `unmeasurable("maxLossPerTrade")` rather than silently falling
back to zero fees — falling back to zero reintroduces exactly this bug under a
different name.

Rewrite the comment. Whatever the outcome, it should no longer argue that
excluding fees is conservative, because it is not; if a decision is made to keep
measuring pre-fee (for example because the trader is understood to set the limit
in pre-fee terms), then the UI must label the field that way, and this item
becomes a documentation and labelling change instead.

Leave slippage alone. The comment is right that it is a different question, and
it is genuinely unknowable at gate time.

## Acceptance criteria

- [ ] A test sets `maxLossPerTradeUsdt` to 100 and submits an intent whose
      pre-fee stop loss is 100 on a notional large enough that fees push the
      real loss above 100, and asserts the order is **refused**
- [ ] The test fails without the fix
- [ ] A trade whose fee-inclusive loss is under the limit still passes
- [ ] Maker and taker rates are applied per leg, not as one flat rate
- [ ] An unresolvable fee rate produces `unmeasurable`, not a zero-fee estimate
- [ ] The comment no longer claims the pre-fee figure is conservative

## Links

- BUG-0499 — the other limit in this file that under-measures, for an unrelated
  reason
- `src/lib/calculators/core.ts` — the per-leg fee helper and the FEAT-0253
  reasoning this check should be reusing
- `docs/backlog/features/FEAT-0013-*` — the risk limits this belongs to
