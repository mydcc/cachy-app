---
id: FEAT-0389
title: Replace the alert modal with a Super-Alert side panel
type: feature
status: in-progress
assignee: claude
branch: worktree-super-alert-side-panel-59eaf9
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
- `src/components/alerts/AlertPanelView.svelte` (was `AlertDefinitionsModal.svelte`, removed), `src/components/shared/LeftControlPanel.svelte`
- Reference behaviour: Bitunix "Super Alert" panel (described, not reproduced)

## State (2026-09-06)

The shell is built. What exists:

- `AlertPanelWindow` (`WindowType: 'alertpanel'`) — a `WindowBase` on the shared
  stack, docked right, `showBackdrop: false` and `closeOnBlur: false` so the
  chart stays visible *and* clickable beside it. This answers the open question:
  there was no panel primitive, and ADR-0006 already required a floating surface
  to be a `WindowBase`, so no new primitive was invented beside `ModalFrame`.
- `AlertPanelView.svelte` — header (symbol / price source / anchor timeframe),
  tab strip with roving-tabindex arrow keys, one dynamic import per tab, the
  plain-language sentence, the engine-failed banner, field-anchored refusals plus
  a catch-all for refusals no control claims.
- `alertPanel.svelte.ts` — the shared draft `RuleDocument` every builder tab will
  edit, plus `refusalsForField` / `unclaimedRefusals`.
- `ruleSentence.ts` — the rule as a sentence, composed from `rules.sentence.*`
  fragments in both locales. 14 unit tests resolve against the real locale files.
- `armRule.ts` — writes an accepted document into `cachy_rules_v1`, which
  `ruleLoopWiring.ts` reads and `reconcileOrphanedRules.ts` leaves alone (no
  origin-ledger entry means never suspended as an orphan). 6 unit tests.
- `AlertDefinitionsModal.svelte` is deleted; Manage moved to
  `tabs/ManageTab.svelte` with its two cutover notices unchanged.

What is open:

- The five builder tabs are real code-split modules with placeholder bodies.
  Each is replaced by its own item without touching the shell's loader.
- The Manage tab keeps the old quick-add form (symbol + price). It leaves when
  [`FEAT-0390`](FEAT-0390-price-alert-conditions.md) lands — shipping the panel
  without any way to arm an alarm would have been a regression.
- The arm button is disabled until the draft has a condition, which no builder
  can produce yet. The path behind it (validate → `armRule`) is complete and
  tested, so FEAT-0390 only has to write into `alertPanelState.draft`.
- The price-source select in the header is not yet wired into the document; it
  becomes the default `PriceField` for the Price tab's conditions in FEAT-0390.
