---
id: FEAT-0389
title: Replace the alert modal with a Super-Alert side panel
type: feature
status: done
branch: worktree-super-alert-panel-shell-2c0093
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

- [x] The panel opens from the bell and the chart stays visible and interactive beside it
- [x] Every armed rule renders as a readable sentence in both locales, and the sentence
      changes when the rule changes
- [x] A rule refused by `validate()` shows the refusal against the offending field, not
      as a single generic message
- [x] The engine-failed banner is shown whenever `engineStatus === "failed"`
- [x] Manage lists armed rules and history with the same behaviour as the current modal
- [x] Tabs are code-split; opening the panel does not load every builder
- [x] Keyboard reachable and focus-trapped; Escape closes without arming
- [x] German and English strings

## Out of scope

- The builders themselves. Each is its own item.
- Chart and indicator-settings entry points — [`FEAT-0395`](FEAT-0395-alert-entry-points.md).

## Open questions

- ~~**Is there a panel primitive already?**~~ **Answered:** no, and none was
  added. `ADR-0006` already requires every floating surface to be a `WindowBase`,
  so the panel is `AlertPanelWindow` on the shared stack rather than a second
  primitive beside `ModalFrame.svelte`. Its non-modal behaviour is three registry
  flags, not markup — see the closing state below.

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

## Grooming note (2026-09-08)

Shell merged (#2727). Proven by tests: sentence rendering both locales (`AlertPanelView.component.test.ts`, `ruleSentence.test.ts`), field-anchored refusals, engine-failed banner. Open: bell entry + chart interactivity, Manage parity, tab code-splitting proof, keyboard Escape/focus-trap, panel-chrome strings.

## Closing state (2026-09-10)

The five criteria the grooming note left open were already implemented — by
#2727 and by FEAT-0390 and FEAT-0395 landing on top of it — and had no test
holding them. This item closes by writing those tests, so the criteria stop
depending on someone re-reading the code to know they still hold.

| Criterion | What proves it |
|---|---|
| Opens from the bell | `LeftControlPanel.component.test.ts` — the bell raises `uiState.showAlertsModal`, opens rather than toggles, and carries an `aria-label` |
| Chart stays visible and interactive | `WindowRegistry.test.ts` — `showBackdrop`, `closeOnBlur` and `centerByDefault` are all false for `alertpanel`. These three flags *are* the criterion; a "make it consistent with the other windows" edit is how the modal's defect returns |
| …and lands *beside* the chart | `implementations/AlertPanelWindow.test.ts` — docks to the right edge on first open, leaves usable width to its left, clamps on a narrow viewport, and does not overrule a position the trader dragged it to |
| Manage parity | `tabs/ManageTab.component.test.ts` — active vs. history split, fired badge, per-row delete, empty state |
| Tabs code-split | `tabCodeSplitting.test.ts` — one literal `import()` per tab, no template-literal and no static tab import |
| Keyboard, focus, Escape | `AlertPanelView.component.test.ts` (Tab wraps at both ends, mid-cycle Tab still moves, Escape arms nothing) and `WindowManager.test.ts` (the panel is Escape-dismissible *despite* `closeOnBlur: false`) |
| German and English strings | 23 `dashboard.alerts.panel.*` keys, locale parity checked by the i18n suite |

Not covered: no e2e spec drives the bell in a real browser. Every link of the
chain is asserted at its own level — bell → `uiState` flag → mounted window →
registry flags → docked geometry — but nothing asserts the rendered result in
a running app. `tests/e2e/` is where that would go if the panel ever earns a
regression.

One fix came out of writing the tests: the panel root carried the Tab-trap's
`onkeydown` with no ARIA role, which the Svelte compiler had been warning about
(`a11y_no_static_element_interactions`) and which made the trap's container
invisible to assistive tech. It is now `role="region"` with the panel title as
its label.

What belongs to other items, not here:

- The five builder tabs are real code-split modules with placeholder bodies.
  FEAT-0391, FEAT-0030, FEAT-0028 and FEAT-0394 replace the bodies without
  touching the shell's loader. FEAT-0390 already replaced the Price tab.
- The price-source select in the header is still not wired into the document.
