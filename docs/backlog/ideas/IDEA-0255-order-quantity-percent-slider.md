---
id: IDEA-0255
title: Add a 0/25/50/75/100% quantity slider to the order-entry form
type: idea
status: idea
priority: P3
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
---

# IDEA-0255 — Add a 0/25/50/75/100% quantity slider to the order-entry form

## The thought

The Bitunix order-entry form ties `Qty` to a percent-of-available-balance
slider with snap marks at 0/25/50/75/100%
([`IDEA-0199`](IDEA-0199-bitunix-ui-analysis.md) §1.2 "Qty / Size / Value").
Cachy's own order form has no equivalent — quantity is typed only.

This was noticed while scoping
[`FEAT-0254`](../features/FEAT-0254-tpsl-input-range-slider-ux.md) (the TP/SL
trigger-price slider) and deliberately kept out of it: it is a different
value bound to a different concept — position size as a percentage of
available margin, not a PnL/ROI/price-change percentage on an existing
position — and belongs on a different screen (the order-entry form, not the
TP/SL modal). Folding it into FEAT-0254 would have been scope creep dressed
as reuse; the two need to share the underlying `RangeSlider` primitive that
item builds, not the calculation logic around it.

## Why not now

M3's order-entry form ([`FEAT-0021`](../features/FEAT-0021-order-types.md))
already shipped without it; this is a UX addition on top of working order
placement, not a blocker for anything else in M3. Worth doing once
[`FEAT-0254`](../features/FEAT-0254-tpsl-input-range-slider-ux.md)'s
`RangeSlider` primitive exists, so this becomes "mount the existing slider
against `PlaceOrderPanel.svelte`'s quantity/balance fields" rather than a
second slider implementation.

## Links

- [`IDEA-0199`](IDEA-0199-bitunix-ui-analysis.md) §1.2 — reference screenshot
- [`FEAT-0254`](../features/FEAT-0254-tpsl-input-range-slider-ux.md) — the
  `RangeSlider` primitive this would reuse
- `src/components/results/PlaceOrderPanel.svelte`
