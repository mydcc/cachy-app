---
id: FEAT-0389
title: Replace the alert modal with a Super-Alert side panel
type: feature
status: specced
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0387, FEAT-0388]
size: M
estimate: 5
---

# FEAT-0389 — Replace the alert modal with a Super-Alert side panel

## Problem

`AlertDefinitionsModal.svelte` offers two text inputs and a list. It cannot express an
indicator condition, a combination, a timeframe, or a frequency — and being a modal, it
covers the chart the trader is reading while deciding where to put the alarm. Every
adjustment costs a close-and-reopen.

## Proposal

A right-hand **side panel**, opened from the existing bell in
`LeftControlPanel.svelte:83`, with tabs that each build a `RuleDocument`:

| Tab | Builds |
|---|---|
| Templates | A named strategy, editable before arming — [`FEAT-0391`](FEAT-0391-alert-template-library.md) |
| Combo | Conditions joined with AND/OR — [`FEAT-0030`](FEAT-0030-combined-alerts.md) |
| Price | Threshold and move conditions — [`FEAT-0390`](FEAT-0390-price-alert-conditions.md) |
| Indicators | Indicator conditions — [`FEAT-0028`](FEAT-0028-indicator-alerts.md) |
| Candlesticks | Pattern conditions — [`FEAT-0394`](FEAT-0394-candlestick-pattern-conditions.md) |
| Manage | Armed rules and history — exists today |

This item builds the **shell**: panel, tab strip, symbol/price-source/timeframe header,
the shared footer, and the Manage tab moved across. Each builder tab is its own item and
lands into the shell.

Two things this item owns and nothing else does:

**Plain-language rule rendering.** Above the arm button, the assembled rule is written
out as a sentence in German and English — "Feuert einmal, wenn auf dem 4h-Close RSI(14)
unter 30 fällt und MACD(12,26,9) golden crosst." This is the difference between a
builder a trader trusts and one they guess at, and it is the open question
[`FEAT-0030`](FEAT-0030-combined-alerts.md) already raises.

**The engine warning survives.** `alertState.engineStatus === "failed"` keeps its
visible banner. `BUG-0382` was a stored alert that silently never fired; a redesign that
drops the warning re-opens it.

Tabs load lazily, the way `+layout.svelte:82` already loads the modal.

## Acceptance criteria

- [ ] The panel opens from the bell and the chart stays visible and interactive beside it
- [ ] Every armed rule renders as a readable sentence in both locales, and the sentence
      changes when the rule changes
- [ ] A rule refused by `validate()` shows the refusal against the offending field, not
      as a single generic message
- [ ] The engine-failed banner is shown whenever `engineStatus === "failed"`
- [ ] Manage lists armed rules and history with the same behaviour as the current modal
- [ ] Tabs are code-split; opening the panel does not load every builder
- [ ] Keyboard reachable and focus-trapped; Escape closes without arming
- [ ] German and English strings

## Out of scope

- The builders themselves. Each is its own item.
- Chart and indicator-settings entry points — [`FEAT-0395`](FEAT-0395-alert-entry-points.md).

## Open questions

- **Is there a panel primitive already?** If not, add one beside
  `src/components/shared/ModalFrame.svelte` rather than restyling the modal into a
  panel; the stacking authority in `ADR-0006` applies either way.

## Links

![Panel-Layout](../assets/FEAT-0389/panel-layout.svg)

*Wireframe: der Chart bleibt links bedienbar, das Panel sitzt rechts. Der Block
unter der Fußzeile ist die Klartext-Regel.*

- [`docs/alert-system.md`](../../alert-system.md) — the tab map and entry points
- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md)
- `src/components/alerts/AlertDefinitionsModal.svelte`, `src/components/shared/LeftControlPanel.svelte`
- Reference behaviour: Bitunix "Super Alert" panel (described, not reproduced)
