---
id: FEAT-0328
title: Compact account-controls row and wire up maker/taker fee display
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [FEAT-0068]
---

# FEAT-0328 — Compact account-controls row and wire up maker/taker fee display

## Problem

`ExchangeAccountControls.svelte` stacks leverage, margin mode (Isolated/Cross)
and position mode (One-way/Hedge) vertically — three rows that eat vertical
space in the trade panel. The user wants all three in one compact row.

The leverage flow is also two-step in the wrong way: set leverage in the
calculator, then walk down and click "Apply" to push it to the broker. The
user wants to set and send in one place, compact and functional. The Bitunix
dialog-with-explanation pattern is the right model.

In the Settings → Execution tab there are two dead Maker/Taker input fields.
They exist in the UI but are not wired to the frontend. The user wants them
connected: paper trading uses the user-entered maker/taker fees, live trading
uses the broker's fees via API. The user picks Maker or Taker in Settings.

## User value

This is not a cosmetic refactor. Each change removes a real friction point
for a trader managing real money:

1. **One place, one thought.** Today the user sets leverage in the calculator,
   scrolls down, clicks "Apply", then wonders "did it go through?". After:
   leverage is set and sent from one chip. No context-switch, no
   "did I apply yet?" moment.

2. **Sync feedback in real time.** The chip shows local vs. remote state:
   `10x` when in sync, `10x → 12x` when local is ahead (with Apply right
   there), a brief green pulse when the broker confirms. The user always
   knows what the broker is actually using.

3. **Fee transparency.** The fee chip shows context, not just a number:
   `Maker 0.04%` (yellow = paper/simulated) vs. `Taker 0.05%` (blue =
   live broker). Hover reveals the source ("From Settings" or "From Broker
   API"). No more guessing why a fee is what it is.

4. **Consequence before confirmation.** When changing leverage on an open
   position, the confirmation dialog shows the liquidation-price shift
   ($X → $Y) *before* the user commits — an informed decision, not a
   surprised one.

5. **Vertical space back.** Three rows become one. The reclaimed space goes
   to the position list, chart, or order entry — the things the user looks
   at more often than account settings.

## Proposal

**1. Collapse the three account controls into one horizontal row** inside
`ExchangeAccountControls.svelte`. Use `flex-row` with graceful wrapping below
~480px. All three controls reuse Cachy's existing visual language — same
border/accent/disabled treatment as the order-type and TP/SL toggles, no
hardcoded colors, only CSS variables and paired utility classes.

```
[Leverage: 10x ▾]  [Isolated|Cross]  [One-way|Hedge]
```

- **Leverage**: inline chip showing remote value. Click opens a popover
  (Bitunix-style) with a number input, min/max from `pairMeta`, and one
  "Apply" that calls `changeLeverage` directly. No separate calculator input
  needed to apply.
- **Margin mode**: two-segment toggle (Isolated | Cross), active segment
  highlighted, disabled with reason while symbol is busy.
- **Position mode**: two-segment toggle (One-way | Hedge), same treatment,
  disabled with reason while account is busy.
- Confirmation dialog still fires for leverage on a busy symbol
  (liquidation-price move).

**2. Wire up the Maker/Taker fee fields** in Settings → Execution tab:

- Two numeric inputs for maker fee and maker/taker fee, plus a Maker/Taker
  selector. These feed `SettingsManager.feePreference`.
- When paper trading is active: the selected fee (maker or taker) is used for
  calculations and displayed in the frontend.
- When a broker is connected: fees come from the broker via API
  (`TradeManager.remoteMakerFee` / `remoteTakerFee`). The user sees the real
  broker fee as a display-only chip — no input field needed. The input fields
  are irrelevant here since the user rarely changes broker fees anyway.
- The fee display in the Execution tab becomes a compact chip showing the
  active rate, with a color hint (paper vs. live) and a tooltip revealing
  the source.

## Acceptance criteria

**Layout & design**
- [ ] Leverage, margin mode and position mode render in one horizontal row
      in `ExchangeAccountControls.svelte`, wrapping to two lines below ~480px.
- [ ] All three controls match Cachy's existing design language: same
      border/accent/disabled treatment as order-type and TP/SL toggles, only
      CSS variables and paired classes, no hardcoded colors.
- [ ] The row visually reads as one unit — consistent height, spacing, and
      typography (`text-[10px]` like today).

**Leverage UX**
- [ ] Leverage is set and sent from this component alone — no dependency on
      the calculator's `tradeState.leverage` input to apply.
- [ ] The leverage chip shows the remote value at a glance; clicking opens a
      popover with min/max from `pairMeta` and an Apply action.
- [ ] Sync state is visible without reading: in-sync shows plain value,
      local-ahead shows `10x → 12x`, broker-confirmed gives brief visual
      feedback (e.g. green pulse).
- [ ] Confirmation dialog still fires for leverage on a busy symbol, and now
      shows the liquidation-price shift ($X → $Y).

**Margin & position mode**
- [ ] Margin mode and position mode toggles reflect remote state, disabled
      with a reason while busy (unchanged behavior).

**Fee wiring & display**
- [ ] Settings → Execution tab: maker/taker input fields are wired to
      `SettingsManager.feePreference` and persist correctly.
- [ ] Paper trading: selected fee (maker or taker) is used for calculations
      and displayed in the frontend.
- [ ] Live trading with broker: broker fees (remoteMakerFee/remoteTakerFee)
      are displayed as a read-only chip; input fields are hidden or disabled.
- [ ] Fee chip shows the active rate with a color hint (paper vs. live) and
      a tooltip revealing the source ("From Settings" / "From Broker API").
- [ ] No new dependencies; reuses `modalState`, `tradeState`, `accountState`,
      `settingsState`.

## Out of scope

- Multi-trade / hedge-mode order entry (separate FEAT, requires hedge mode
  support first).
- Changing the calculator's leverage input behavior for position sizing —
  this item only changes how leverage reaches the exchange.
- Fee *input* in the trade panel — fee entry stays in Settings.

## Open questions

- Should the leverage chip show a sync indicator (green dot when local =
  remote), or is the value match enough?
- Does the leverage popover close on outside click, or only on Apply/Cancel?
- When a broker is connected, should the maker/taker input fields be hidden
  entirely, or shown disabled with a "using broker fees" note?
- What functional concerns apply when changing leverage/margin/position mode
  on a real-money trading platform (preconditions, race conditions, stale
  state, confirmation needs)?

## Implementation notes

Non-obvious concerns the implementer should keep in mind:

**Fee field**
- Use `decimal.js` for all fee values — never `parseFloat` or `number`.
  A fee of `0.04%` is the multiplier `0.0004`; rounding errors here cost
  money on every trade.
- Decide whether one maker/taker value covers both entry and exit, or whether
  entry (often taker) and exit (often maker, for resting limits) need
  separate fields.
- Validate paper-trading fees in the frontend: reject negative, >100%,
  empty, or non-numeric input before it reaches the calculator.
- Two display formats, one source: the chip shows `0.04%`, the calculator
  uses `0.0004`. Derive both from the same `Decimal` value — never format
  twice from different sources.
- When the user toggles paper trading, the fee source switches. If the
  broker fee has not loaded yet, fall back gracefully (show "—" or the
  last known value, never a stale zero).

**Leverage & sync**
- A WebSocket push can update `remoteLeverage` while the user is editing the
  popover. Do not overwrite the local draft; only update the displayed
  remote value.
- The existing `busy` flag already blocks double-Apply. Keep it.
- If the broker is offline, `remoteLeverage` may be stale. Consider marking
  the chip as stale (dimmed / question mark) until the next confirmed read.

**Layout & interaction**
- On mobile the popover may need to become a fullscreen modal instead of a
  floating element — test at <480px.
- The calculator's `tradeState.leverage` input stays for position sizing.
  Decide whether the chip and the calculator input should stay in sync or
  remain independent.

**i18n**
- All new strings (popover labels, tooltips, sync states) go into both
  German and English in `src/locales/`.

**Tests**
- Existing tests for `ExchangeAccountControls` may break on the layout
  change — update selectors and snapshots. Run the affected component
  tests, not the full suite.

## Links

- `src/components/inputs/ExchangeAccountControls.svelte` — the component to
  collapse into one row.
- `src/stores/settings.svelte.ts:774` — `SettingsManager.feePreference`.
- `src/stores/trade.svelte.ts:206-207` — `remoteMakerFee` / `remoteTakerFee`.
- `src/stores/types.ts:148` — `FeeRateType`.
- `src/components/inputs/GeneralInputs.svelte:79-81` — `feeMode` /
  `targetRemoteFee` (current fee display).
- FEAT-0068 — the original account-settings feature this refactors.
