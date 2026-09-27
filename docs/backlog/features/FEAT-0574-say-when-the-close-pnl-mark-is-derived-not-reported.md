---
id: FEAT-0574
title: Say when the close dialog's PnL mark is derived, not reported
type: feature
status: ready
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: ADR-0010
depends_on: []
---

# FEAT-0574 — Say when the close dialog's PnL mark is derived, not reported

## Problem

`OMSPosition.markPrice` is optional — Bitget does not always send it. The partial-close
dialog needs a mark to say what PnL a close would realise, so
[`ClosePositionModal.svelte`](../../src/components/shared/ClosePositionModal.svelte)
recovers one from the unrealised PnL the venue *does* report: PnL is the mark distance
times the size, so the mark is entry plus PnL per unit.

That recovery is the right fallback. Defaulting to the entry price instead would print a
realised PnL of exactly zero, which reads as *"this close books nothing"* rather than
*"the mark is unknown"* — the same failure mode
[ADR-0010](../../docs/adr/0010-estimates-inform-but-never-determine-what-is-sent.md)
rejects for the net-of-fees line, where an absent rate hides the figure instead of
rendering it as zero.

The problem is that the two cases are collapsed into one value before anything is
displayed. `markPrice` is a single `$derived.by`, and everything downstream — the
`PartialCloseContext`, `realizedPnlOnClose`, the readout — sees one number with no record
of where it came from. So a figure derived from a stale `unrealizedPnl`, carried over
from before the last price move, is indistinguishable on screen from one the venue
reported a moment ago. The arithmetic is exact when both inputs are fresh and quietly
wrong when they are not, and nothing on screen says which case the trader is looking at.

## Proposal

Keep the recovery, and keep every number the trader gets today. Add the one thing that is
missing: the dialog distinguishes a mark the venue reported from one it derived, and says
so in the readout when the figure is derived.

The value path does not change — `realizedPnlOnClose` and the quantity that reaches the
venue are untouched. What changes is that an estimate announces itself, which is what
ADR-0010 asks of an estimate in the first place: it informs, and it says that it is
informing.

## Acceptance criteria

- [ ] The dialog distinguishes a mark the venue reported from one derived from unrealised
      PnL, and the derived case is labelled as such beside the PnL figure in both locales
- [ ] The qualifier appears only when the mark was derived, and never when the venue
      reported one
- [ ] The derived value is unchanged from today: entry plus (or minus, short) PnL per
      unit, with a position of `amount <= 0` still falling back to the entry price
- [ ] No path renders a realised PnL of exactly zero while the mark is unknown — the
      entry-price default stays out, for the reason ADR-0010 gives
- [ ] The quantity that reaches the venue is identical with and without the qualifier,
      proven by a test that mounts the dialog both ways and compares the submitted
      quantity
- [ ] Both locale strings are added and `npm run i18n` parity stays green

## Out of scope

- Hiding the PnL line when the venue is silent. Decided in
  [`TODO.md` 30](../../TODO.md#30-how-should-the-panel-behave-when-the-venue-does-not-report-a-mark-price):
  it never shows a wrong figure, but it removes the one number a trader most wants during
  a panic close, and it makes the dialog inconsistent across venues for no reason the
  trader can see. A visible qualifier gets the honesty without the loss.
- Using the derived mark anywhere it becomes load-bearing — a journal entry, a risk
  calculation, or a confirmation summary under
  [`FEAT-0024`](FEAT-0024-confirmation-policy.md). ADR-0010 says an estimate informs and
  never determines; the moment a derived figure reaches a decision, that is a new
  decision, not an extension of this one.
- Changing what the venues report, or adding a request for the mark where none is sent.
- The quantity semantics of the slider — that is
  [`FEAT-0573`](FEAT-0573-say-what-the-close-percentage-is-measured-against.md).

## Links

- [`TODO.md` 30](../../TODO.md#30-how-should-the-panel-behave-when-the-venue-does-not-report-a-mark-price) — the decision and its full reasoning
- `src/components/shared/ClosePositionModal.svelte` — the `markPrice` derivation
- `src/lib/calculators/partialClose.ts` — `realizedPnlOnClose`, which drives nothing
- [`ADR-0010`](../../docs/adr/0010-estimates-inform-but-never-determine-what-is-sent.md) — estimates inform, never determine
