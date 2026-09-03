---
id: FEAT-0328
title: Compact account-controls row and wire up maker/taker fee display
type: feature
status: done
shipped: 1.6.0-beta.195
priority: P2
milestone: none
editions: [community, pro, private]
area: trade-panel
data_class: A
adr: none
depends_on: [FEAT-0068]
assignee: claude
branch: worktree-issue-2522-discussion-89bcd8
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
Leverage      Margin Mode          Fees (%)
[ 10x ]       [Cross • One-way]    [0.0600      TAKER]
```

**As built** (the reference dialogs settled the shape): three labelled
columns, each a single control. Margin mode and position mode share one chip
and one modal, the way the venue's own dialog presents them — they are two
halves of "how does this account hold positions", and giving each its own
inline pair of buttons cost a whole row for no gain. The trade panel's column
is ~230px, which the earlier six-button row could not fit.

**Nothing sends on a click.** Both chips open a dialog that collects a draft;
only its Confirm reaches the exchange, and only for the values that actually
differ from what the venue reports. Every write here changes a live account,
so every one of them is a deliberate second act — a stray tap or a stray drag
must never be enough. The earlier revision fired a request on the click
itself; the test group "nothing travels without a confirmation" exists so
that cannot come back.

Both dialogs are `ModalFrame` — Cachy's own window shell, the same one
`AdjustMarginModal` and `TpSlEditModal` use — rather than a bespoke overlay,
so they stack, dim and close like every other dialog in the app.

The leverage dialog carries a slider with its scale, the steppers, and the
venue's documented fact that leverage may be changed with an open position.
The mode dialog draws what each option means: cross as one pool feeding both
positions, isolated as a wall between them.

**Deliberately not built: "max position size".** Deriving it would mean
multiplying an available balance by the leverage, which ignores the venue's
tiered position limits — at high leverage the real cap is far below that
product, and a maximum the exchange would refuse is a misleading number on a
money screen. The live liquidation projection is shown instead: it is the
consequence that actually decides whether a leverage is sane.

`ExchangeAccountControls` emits the first two columns as siblings with no
wrapper, so `GeneralInputs` can lay them out beside its own fee column; on a
venue that declares no `accountSettings` support it emits nothing and the row
simply narrows to the fee column alone.

Leverage no longer has a separate calculator input — one leverage per symbol
means one control (decision 5). With no broker value, or in paper trading,
that one control edits `tradeState.leverage` locally instead of sending.

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

**The three controls look alike but are gated differently, and that must not
change when they become one row.** The exchange documents a different
precondition for each (`docs/bitunix-api/02_account.md`):

| Control | Exchange precondition | Gate in code |
| --- | --- | --- |
| Leverage | **none** — changeable with open positions and resting orders | *no* busy gate; confirmation dialog only |
| Margin mode | no position **or** order on **this symbol** | `symbolBusy` |
| Position mode | no position **or** order on **any** pair | `accountBusy` |

A single shared gate across the collapsed row would break leverage — the one
control the exchange places no restriction on. FEAT-0068 already got this
right; the refactor must not flatten it.

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
- [x] Leverage, margin mode and position mode render in one horizontal row,
      wrapping below ~480px. Verified in the running app: the trade panel's
      column is ~230px and all three columns sit on **one** line —
      `Leverage [10x]` · `Margin Mode [— • —]` · `Fees (%) [0.0140 MAKER]` —
      against the three stacked rows it started as. Collapsing margin and
      position mode into one chip is what bought the room; six inline buttons
      could not fit at this width.
- [x] All three controls match Cachy's existing design language: same
      border/accent/disabled treatment as order-type and TP/SL toggles, only
      CSS variables and paired classes, no hardcoded colors.
- [x] The row visually reads as one unit — consistent height, spacing, and
      typography (`text-[10px]` like today).

      Fixed along the way: `<ExchangeAccountControls />` was nested *inside*
      `GeneralInputs`' two-column `grid grid-cols-2` (the one holding the
      leverage and fee inputs), so it only ever got half the panel — 108px of
      227px. Harmless while it was three stacked rows; fatal for a single row.
      It now closes that grid first and sits in the full-width column.

**Leverage UX**
- [x] Leverage is set and sent from this component alone — no dependency on
      the calculator's `tradeState.leverage` input to apply. Proven by
      "sends what the editor holds, ignoring the calculator's own input".
- [x] The leverage chip shows the remote value at a glance; clicking opens a
      popover with min/max from `pairMeta` and an Apply action.
- [x] Sync state is visible without reading: the chip shows the value the
      exchange holds, and it changes only when the exchange confirms it on a
      re-read.
      *Superseded:* `10x → 12x` on the chip. That was designed for an inline
      popover; the editor is a centred modal (per the reference dialogs), so
      while a draft exists the modal covers the chip and shows the draft
      itself. A "pending" arrow on a hidden element is not feedback.
      *Not done:* the green confirmation pulse — the value changing to the
      exchange-confirmed number is already the feedback, and a pulse on a
      re-read that may lag the request would say "confirmed" before it is.
- [x] Confirmation dialog still fires for leverage on a busy symbol, and now
      shows the liquidation-price shift ($X → $Y) — calibrated by solving
      Cachy's own liquidation formula for the MMR implied by the venue's own
      reported entry/liquidation/leverage, then re-applying it at the new
      leverage. Labelled an estimate, and omitted entirely when the venue did
      not report the numbers to derive it.
- [x] **One leverage, one source.** With a broker connected, the chip is the
      only place leverage is set, and the calculator's leverage field mirrors
      `remoteLeverage` read-only — the two can never display different
      numbers. In paper mode (or with no broker) the calculator field stays
      freely editable as today. Proven by
      `GeneralInputs.leverageMirror.component.test.ts`.
- [x] Leverage stays operable while a position is open — never disabled by
      `symbolBusy`, only confirmed through the dialog.

**Margin & position mode**
- [x] Margin mode is gated on `symbolBusy`, position mode on `accountBusy`,
      and leverage on neither — the asymmetry survives the layout change.
      Proven by "gates the three controls differently for one open position"
      and its sibling for a position on another symbol.
- [x] Both toggles reflect remote state and show the reason they are disabled
      (unchanged behavior).

**Fee wiring & display** — MOVED OUT on 2026-08-31, see "Fee wiring: what is
actually there" below. The whole fee half now belongs to **FEAT-0253**, which
already owned fee-estimate honesty and has been promoted to `specced`/P1 with
the decisions recorded. The stale default rate is **BUG-0329**, separate so it
can be fixed without waiting.

The criteria below are kept unticked and struck through only as a pointer to
where they went; do not implement them from here.

- [ ] ~~Settings → Execution tab: maker/taker input fields are wired to
      `SettingsManager.feePreference` and persist correctly.~~ → FEAT-0253
- [ ] Paper trading: selected fee (maker or taker) is used for calculations
      and displayed in the frontend.
- [ ] Live trading with broker: broker fees (remoteMakerFee/remoteTakerFee)
      are displayed as a read-only chip; input fields are hidden or disabled.
- [ ] Fee chip shows the active rate with a color hint (paper vs. live) and
      a tooltip revealing the source ("From Settings" / "From Broker API").
- [ ] No new dependencies; reuses `modalState`, `tradeState`, `accountState`,
      `settingsState`.

## Fee wiring: what is actually there

Read before touching the fee half. The Problem section above says "there are
two dead Maker/Taker input fields — they exist in the UI but are not wired".
That is not what the code contains, and the difference changes the work from
wiring to design.

What is actually in the tree:

- **No numeric maker/taker fee fields exist anywhere in Settings.** What sits
  in Settings → Execution (`src/components/settings/tabs/TradingTab.svelte`,
  the Fee Preference block) is a two-button MAKER/TAKER *selector*.
- **That selector persists correctly** — `settings.svelte.ts` declares it at
  :774, merges it in `applyCoreFields` and writes it in `toJSON`. So
  "not wired to `feePreference`" is backwards: it *is* `feePreference`.
- **`feePreference` is write-only.** Nothing reads it. A full-text sweep finds
  it in `TradingTab.svelte`, `settings.svelte.ts` and `hotkeyService.test.ts`
  only — no calculator, no display. *That* is the dead part, and it is the
  setting rather than a field.
- The trade panel's own fee input writes `tradeState.fees`, and which remote
  fee it offers to sync is chosen by `tradeState.feeMode`
  (`"maker_taker" | "flat"`) — a second, unrelated mechanism that does not
  consult `feePreference` at all.

So the remaining work is: create the numeric fields, make `feePreference`
actually select between them, resolve paper vs. broker as the source, and
feed the existing two-leg `FeeRates` model. That changes which number reaches
the position-size and break-even maths, which is why it was not built blind
in the same pass as the leverage half.

**And there is nothing to mirror.** The Proposal above says broker fees "come
from the broker via API (`TradeManager.remoteMakerFee` / `remoteTakerFee`)".
No such API exists: verified against the live navigation of Bitunix's own API
docs, which lists no fee, commission or VIP-tier endpoint in any section, and
`remoteMakerFee`/`remoteTakerFee` have no writer anywhere in the tree. ADR-0010
had already recorded the same thing.

What *is* obtainable is the fee actually charged on each fill, which Cachy
already syncs — so the broker really is the source of truth, just via
`get_history_trades` rather than a tariff endpoint.

**All of this moved to FEAT-0253** (`specced`, P1) on 2026-08-31, with the four
decisions recorded there: derive from fills, resolution order with visible
provenance, entry-leg derived / exit-leg assumed taker, and the Settings
buttons becoming the exit assumption. The stale `DEFAULT_FEES` constant is
**BUG-0329**.

FEAT-0328 keeps what it actually delivered: the collapsed row, the leverage
chip and its editor, and the UI polish still outstanding below.

## Out of scope

- Multi-trade / hedge-mode order entry (separate FEAT, requires hedge mode
  support first).
- Changing *how* position size is computed from leverage. The sizing maths is
  untouched; only the *source* of the leverage number changes when a broker is
  connected (see "One leverage, one source").
- Fee *input* in the trade panel — fee entry stays in Settings.

## Resolved decisions

Settled 2026-08-31, before promotion to `ready`. Recorded so they are not
re-litigated during implementation.

1. **Sync indicator — the value match is enough.** No separate green dot.
   `10x` means synced, `10x → 12x` means a local draft is pending. A dot next
   to a number that already says the same thing is noise.

2. **The popover closes on Apply/Cancel only**, not on outside click.
   Dismiss-on-outside-click is too easy to trigger by accident on a control
   that writes real-money state, and worse on touch.

3. **Broker connected → maker/taker inputs shown disabled**, with a "using
   broker fees" note; not hidden. A disabled control says the exchange owns
   this value, a vanished one reads as a missing feature — the rule the
   component's header comment already states for margin/position mode.

4. **Real-money preconditions — verified against the exchange, not assumed.**
   Bitunix documents a different precondition per control (table under
   "Proposal", source `docs/bitunix-api/02_account.md`). Leverage is
   explicitly changeable with open positions and resting orders, and Cachy
   mirrors that 1:1 today — that behaviour is a requirement, not an accident,
   and must survive the refactor.

5. **Calculator vs. chip — one source.** Decoupling leverage from the
   calculator input without further care would let the sizing maths run at
   20x while the exchange sits at 10x: a wrong position size on real money.
   Every major venue (Bitunix, Binance, Bybit, OKX) exposes exactly one
   leverage per symbol, so the connected case mirrors the exchange and the
   popover — which already shows min/max and the liquidation-price shift —
   becomes the what-if surface. Paper mode keeps the free input. See the
   acceptance criterion "One leverage, one source".

## Implementation notes

Non-obvious concerns the implementer should keep in mind:

**Fee field**
- Use `decimal.js` for all fee values — never `parseFloat` or `number`.
- **Unit, verified against the code — do not "fix" this.** Cachy stores a fee
  as a *percentage number*, not a fraction: `values.fees = 0.04` means
  `0.04 %`. The division by 100 happens **inside** the calculator
  (`calculateBreakEvenPrice` does `feePercent.div(100)`; see its doc comment
  and `FeeRates` in `src/lib/calculators/tpsl.ts`). Storing `0.0004` because
  "0.04 % is the multiplier 0.0004" makes every fee **100× too small** and is
  a silent money loss on every trade. New Settings inputs must therefore hand
  the calculator the percentage, unconverted.
- Entry vs. exit is **already decided in code**, not open: `FeeRates` in
  `src/lib/calculators/tpsl.ts` carries `entryPercent` and `exitPercent` as
  two separate rates ("the two legs are separate rates because they genuinely
  are"), and `tradeState` already has both `fees` and `exitFees`. Any new
  Settings field has to feed that existing two-leg model rather than
  introduce a third representation.
- Validate paper-trading fees in the frontend: reject negative, >100%,
  empty, or non-numeric input before it reaches the calculator.
- One source for the chip and the calculator: both read the same `Decimal`
  percentage. The chip appends `%`; the calculator divides by 100 itself.
  Never format twice from different sources, and never pre-divide.
- When the user toggles paper trading, the fee source switches. If the
  broker fee has not loaded yet, fall back gracefully (show "—" or the
  last known value, never a stale zero).

**Leverage & sync**
- A WebSocket push can update `remoteLeverage` while the user is editing the
  popover. Do not overwrite the local draft; only update the displayed
  remote value.
- The existing `busy` flag blocks double-Apply across all three controls
  while one request is in flight. Keep it — and do not confuse it with
  `symbolBusy`/`accountBusy`, which encode the exchange's preconditions and
  are deliberately different per control. Three distinct concepts, similar
  names: `busy` = a request is running, `symbolBusy` = this pair has a
  position/order, `accountBusy` = any pair has one.
- If the broker is offline, `remoteLeverage` may be stale. Consider marking
  the chip as stale (dimmed / question mark) until the next confirmed read.

**Layout & interaction**
- On mobile the popover may need to become a fullscreen modal instead of a
  floating element — test at <480px.
- The calculator's `tradeState.leverage` input stays present for position
  sizing, but with a broker connected it mirrors `remoteLeverage` read-only
  (decision 5). Audit every writer of `tradeState.leverage` before changing
  its source — one leftover write path reintroduces exactly the divergence
  the decision exists to prevent.

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
- `src/routes/api/leverage-margin-mode/+server.ts` — the read path
  (`get_leverage_margin_mode`) that feeds `remoteLeverage`/`remoteMarginMode`.
  Read-only by design; the writes go through the exchange service layer.
- `docs/bitunix-api/02_account.md` — the exchange's documented preconditions
  for `change_leverage` / `change_margin_mode` / `change_position_mode`; the
  source for the gating table above.
- FEAT-0068 — the original account-settings feature this refactors.
