---
id: FEAT-0686
title: Feed the market-structure tab with live readings
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0679]
---

# FEAT-0686 — Feed the market-structure tab with live readings

## Problem

The market-structure tab (FEAT-0679) teaches the four market-read steps but
shows no live market. A reader finishes all five cards and still has to open a
chart elsewhere and redo the reading by hand. Static reference has printout
character: correct, but nothing the app could not also say on paper.

## Proposal

Keep the five cards exactly as they are — prose, order, takeaways — and feed
each step with the live reading for the current symbol:

- **Bias** — higher-timeframe EMA direction plus price position above/below it,
  behind the existing timeframe switch.
- **Structure** — last fractal swings with BOS/CHOCH markers, computed from
  price history (deterministic marking, not user drawing).
- **Levels** — nearest higher-timeframe swing zones drawn as chart lines.
- **Regime** — live ADX/Choppiness/bandwidth/ATR values shown against the
  taught thresholds (25, 61.8/38.2), no verdict text.

The boundary that keeps this out of FEAT-0679's classifier ban: the tab shows
measured values at taught thresholds and never stamps a verdict. No text in
the tab states the market *is* trending/ranging/expanding — the interpretation
stays with the reader, exactly as the reference does today.

## Acceptance criteria

- [ ] Each of the four steps shows its live reading for the current symbol;
      the prose cards stay untouched in wording and order.
- [ ] No string in the tab classifies the market (no "trending", "ranging",
      "expansion" verdict on current conditions).
- [ ] Structure markers and level lines are computed from history, need no
      user drawing, and work from the same offline-capable engine as the
      lesson charts.
- [ ] Without connection the tab degrades to today's reference (prose, SVG,
      buttons) with no errors and no empty promises.
- [ ] Mobile container-query rules and DE/EN parity hold as today.

## Out of scope

- **Regime classification labels.** Carried over from FEAT-0679, unchanged.
- **Drawing tools** for user-marked swings or levels.
- **Playbooks or entry/exit rules.**
- **Split view.** Still a separate optional item.

## Open questions

- Which fractal/swing definition marks structure (N-bar fractals vs. the
  lesson-chart series)? Decides false-marker rate on chop.
- One shared timeframe for all demos vs. per-demo switch (review-swarm noted
  up to 3 kline channels on divergent timeframes)?

## Links

- FEAT-0679 — the reference tab this feeds
- FEAT-0678 — live-context feature on the same lessons
- `src/components/shared/MarketStructureView.svelte` — the tab to extend
- `src/components/shared/IndicatorLessonChart.svelte` — chart reuse
