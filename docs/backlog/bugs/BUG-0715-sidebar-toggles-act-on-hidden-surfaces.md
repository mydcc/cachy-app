---
id: BUG-0715
title: Left-rail toggles can stay lit while the panel they name is not rendered
type: bug
status: in-progress
assignee: opencode
branch: fix/ui-left-rail
priority: P2
milestone: none
created: "2026-10-21"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0715 — Left-rail toggles can stay lit while the panel they name is not rendered

## Symptom

The floating left rail shows four toggle buttons — technicals, market overview,
market activity, sentiment. Three of them can show the active state while the
panel they name is not on screen:

- **Technicals** lights when `showTechnicals` is on, but the panel also needs
  `isTechnicalsVisible`. After hiding it with the chevron in MarketOverview, the
  rail button stays lit and clicking it twice still shows nothing.
- **Market activity** lights from the stored preference, while the panel renders
  from a derived value that also requires Pro, exchange keys or a paper account.
- **Sentiment** lights from `showMarketSentiment`, but below `xl` the mobile copy
  of the panel ignores that flag entirely and renders on `enableNewsAnalysis`
  plus news API keys instead — so the toggle has no effect there.

All four do nothing when the sidebar column itself is switched off
(`showSidebars`), which the rail does not show either.

Market overview is the one that behaves: the panel follows the flag at both
widths.

## Evidence

**Derived.** Five pieces that do not agree:

- `src/components/shared/LeftControlPanel.svelte:176-219` — the four buttons set
  `showTechnicals`, `showMarketOverview`, `showSidebarActivity`,
  `showMarketSentiment`, and take `class:active` from the same raw flags.
- `src/routes/+page.svelte:306` and `:709` — both the desktop column and the
  mobile stack are inside `{#if settingsState.showSidebars}`.
- `src/routes/+page.svelte:727` and `:762` — the technicals panel needs
  `showTechnicals && isTechnicalsVisible`; the second flag is toggled from
  `MarketOverview.svelte:533` and persisted separately.
- `src/stores/settings.svelte.ts:848-871` — `effectiveShowSidebarActivity` is
  `(isPro || hasApiKeys || paper) && showSidebarActivity`.
- `src/routes/+page.svelte:711-713` — the mobile news panel renders on
  `enableNewsAnalysis && (cryptoPanicApiKey || newsApiKey)` and never reads
  `showMarketSentiment`.

There is no control on the rail for `showSidebars` itself.

## Cause

The rail was designed as "one toggle per sidebar panel" without a notion of the
column's own visibility. The panels then acquired their own effective-state
rules — legitimately, since no keys means no positions and no news keys means no
news — and the buttons were never taught about them.

## Fix

Make each rail button read and write the same value its panel reads:

- Technicals: toggle `isTechnicalsVisible` (the effective flag), or make
  `showTechnicals` imply it.
- Activity: reflect `effectiveShowSidebarActivity` and explain why it cannot be
  turned on without keys/Pro.
- Sentiment: make the mobile copy honour `showMarketSentiment`, so the flag
  means one thing at both widths.
- All four: hide or disable them when `showSidebars` is off, or let them bring
  the column into existence — the choice belongs with the `showSidebars`
  decision in BUG-0410.

## Acceptance criteria

- [ ] Each rail button's active state matches what the corresponding panel
      actually renders, at `xl` and below
- [ ] A pressed button never leaves the same panel invisible without a reason
- [ ] The sentiment toggle has the same effect at both widths
- [ ] A component test covers the no-keys and `showSidebars`-off cases

## Links

- Found by [FEAT-0606](../features/FEAT-0606-button-placement-visibility-and-dependency-audit.md)
- Evidence table: [`ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §8.1
- Related: [BUG-0410](BUG-0410-mode-state-must-not-depend-on-sidebar.md)
