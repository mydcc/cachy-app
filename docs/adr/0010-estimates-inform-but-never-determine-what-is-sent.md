# ADR-0010: Let an estimate inform a trader, never determine what is sent

- **Status:** Proposed
- **Date:** 2026-08-23
- **Deciders:** @mydcc

## Context

[`FEAT-0254`](../backlog/features/FEAT-0254-tpsl-input-range-slider-ux.md) gave
TP/SL entry a slider with By PnL / By ROI / By Change modes. Each mode converts
a target the trader dials in into a trigger price that is sent to the venue,
and that raised a question with no obvious answer: should those figures be
**gross** of trading fees, or **net**?

Both are defensible, and the app already contains both conventions:

- `roiPercentFromPrice` in [`src/lib/calculators/tpsl.ts`](../../src/lib/calculators/tpsl.ts)
  is gross — it is pure price arithmetic.
- `calculateIndividualTp` in [`src/lib/calculators/core.ts:158-163`](../../src/lib/calculators/core.ts)
  reports `returnOnCapital` **net**, derived from `netProfit`, which subtracts
  both the entry and the exit fee.

So the same trade shown in two places could disagree on screen, and choosing
gross has a real cost: gross is optimistic on *both* legs at once. It
understates what a stop actually costs and overstates what a target actually
pays, which makes the risk/reward ratio — the number a trader decides on —
wrong twice in the same direction. For an application whose purpose is
knowing real risk, that argues strongly for net.

What settled it was not the arithmetic but **how well the input is known**:

1. **The rate is not reliably knowable client-side.** `tradeState.fees`
   ([`src/stores/trade.svelte.ts:177`](../../src/stores/trade.svelte.ts)) is a
   single hand-entered percentage, defaulting to `CONSTANTS.DEFAULT_FEES`
   (`"0.0140"`). `tradeState.remoteMakerFee` / `remoteTakerFee` exist and are
   read by `GeneralInputs.svelte`'s `syncFee()`, but **nothing assigns them** —
   the sync can never fire.
2. **Even a correct rate does not fix it.** Which leg pays which rate depends
   on how the order resolves, and that is not known when the plan is set: a
   take-profit resting as a limit order pays maker, the same position closed
   early at market pays taker. On Bitunix that is 0.014% against 0.042% — a
   factor of three, decided after the fact.
3. **It gets worse with more venues.** Fee schedules, VIP tiers, promotional
   discounts and maker/taker splits differ per exchange and per account.
   Every additional venue widens the gap between the rate Cachy holds and the
   rate actually charged.

If a net figure *drove* the trigger price, every one of those uncertainties
would move a real order. As a displayed figure, they cost a line of
information.

## Decision

**A value derived from an estimate may be displayed to the trader, but must
never determine a value sent to an exchange.**

Concretely, for fees:

- Order-bound arithmetic — anything producing a price, quantity or trigger
  that reaches a venue — is computed **gross**.
- The net-of-fees figure is computed and **shown beside it**, labelled, so the
  optimism of the gross figure is visible rather than silent.
- When no fee rate is known, the net figure is **omitted**, not computed with
  zero. Net displayed as equal to gross reads as *this trade is free* rather
  than *nobody told us the rate*.

The general rule this instantiates: an estimated, unverified or
client-assumed input informs a decision; it does not enter the payload. This
sits directly beneath [`FEAT-0011`](../backlog/features/FEAT-0011-preflight-order-verification.md)'s
gate, which checks that what was displayed is what is sent — this ADR governs
what is allowed to have been displayed as authoritative in the first place.

## Consequences

### What this enables

- The trigger price Cachy computes matches what the venue computes for the
  same target, so a trader cross-checking against the exchange's own UI sees
  the same number. Exchange TP/SL dialogs compute gross.
- The gross ↔ price round trip stays exactly invertible, which the two-way
  slider depends on — `tpsl.test.ts` asserts it. A fee-aware inverse would
  have to solve for an exit price appearing on both sides.
- A wrong or missing fee rate degrades one line of information instead of
  moving an order.
- New exchanges can supply better fee data over time without any risk of
  changing what previously-correct orders would have sent.

### What this costs

- **Two numbers on screen for one trade.** The trader must read both to
  understand the position, and the readout is more cluttered than a single
  figure. This is a real usability cost accepted deliberately.
- **Net is forward-only.** `netPnlFromPrice` / `netRoiPercentFromPrice` have no
  inverse, so a trader cannot dial in *"a stop that costs me exactly 50 USDT
  after fees"*. They dial in gross and read the net consequence.
- **The R:R shown by the gross figures remains optimistic.** Mitigated by
  displaying net, not eliminated. Anyone reading only the gross line is still
  reading an optimistic number.

### What is now forbidden

- Feeding a fee rate, or any figure derived from one, into a computation whose
  output becomes a `price`, `qty`, `triggerPrice`, `tpPrice` or `slPrice` in a
  request payload.
- Rendering a net figure computed from an absent or zeroed fee rate.
- Adding an inverse of a net function for the purpose of driving an input
  control. Adding one for analysis or journal reporting is fine — the rule is
  about what reaches a venue, not about the arithmetic existing.
- Extending this to a *measured* value. Realised fees reported by an exchange
  are facts, not estimates: [`syncService.ts:470-486`](../../src/services/syncService.ts)
  records real per-leg `openFee`/`closeFee` for closed positions, and using
  those in the journal is correct and unaffected by this ADR.

## Alternatives considered

**Net drives the slider.** Rejected on failure mode, not on correctness — it is
the more *accurate* choice when the rate is right, and the inverse is
algebraically available (`P = [netPnL / size + E(1 + fₑ)] / (1 − fₓ)` for a
long). But it makes an unverified, hand-entered number a determinant of a real
order, and it degrades badly: a trader on a different VIP tier, or one whose
take-profit fills maker instead of taker, silently gets a trigger somewhere
other than intended.

**Gross only, no net shown.** What every exchange does, and the simplest. It
was rejected because it makes the R:R optimistic in both directions with
nothing on screen to reveal it — precisely the kind of quiet inaccuracy Cachy
exists to remove. Matching the exchange's *trigger* is required; matching its
*silence* is not.

**A user setting to switch between gross and net.** Rejected: it makes the
meaning of a number depend on a setting the reader may not have seen, and a
screenshot or a support question then carries no way to tell which convention
produced it. Showing both is strictly more informative than letting the trader
choose one.

**Wait for real per-leg fee rates before deciding.** Rejected as a
non-decision: the panel would ship with gross-only behaviour and no rationale
recorded, which is how a convention gets set by accident. The per-leg rate gap
is worth fixing on its own merits — see FEAT-0254's follow-up notes on
`remoteMakerFee`/`remoteTakerFee` and the panel's two-value `feeMode` against
`JournalEntry`'s four — but a better rate does not change this decision, only
the quality of the figure it governs.
