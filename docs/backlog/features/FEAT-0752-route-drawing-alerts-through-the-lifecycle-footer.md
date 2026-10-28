---
id: FEAT-0752
title: Route drawing alerts through the lifecycle footer
type: feature
status: done
assignee: opencode
branch: feature/feat-0752-drawing-alert-tab
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
parent: FEAT-0623
depends_on: []
size: M
estimate: 5
---

# FEAT-0752 — Route drawing alerts through the lifecycle footer

## Problem

Every alert type goes through the Super-Alert builder and its lifecycle footer —
channels, frequency, expiry, note — except one. A drawing is armed directly from
the chart: selecting it and pressing the bell runs `alertOnSelectedDrawing()`,
which calls `armDrawingAlert`, builds the document and writes it, with no footer
in between.

The consequences are visible in the stored rule:

- `trigger_methods` is absent, so the category policy decides where a drawing
  alert is heard — the trader never gets the per-rule choice every other type
  has.
- `frequency` is absent, which the core reads as `once`. A drawing alert cannot
  be set to repeat.
- There is no note, and no expiry.
- Until [`FEAT-0542`](FEAT-0542-view-and-edit-armed-alert-from-manage.md)
  ships there is also no way to change any of it afterwards; after it ships, the
  edit path would still have to invent values the builder never asked for.

So the same system has two creation paths with different capabilities, and the
one that bypasses the builder is the one a trader reaches by selecting a drawing
and pressing the bell in the chart's drawing overlay — the fastest, most casual
path.

## Proposal

One authoring surface stays the rule: the panel. Add a **Drawing** tab that the
chart seeds the way the indicator card seeds the Indicators tab.

1. `AlertPanelSeed` gains the drawing and a `drawing` tab: the seed carries the
   drawing id, its symbol and its timeframe (not a `Condition` — the condition
   is the drawing). The chart's alert action seeds it instead of calling
   `armDrawingAlert` directly. The tab resolves the drawing from the drawing
   store for the read-only level; a drawing that no longer exists refuses with
   the same reason the chart shows today.
2. The tab shows no editable condition — the level is the drawing's — with the
   condition in plain language, and the standard footer
   (`RuleLifecycleFields`) below it: channels, frequency, expiry, note.
3. Arming still goes through `armDrawingAlert`, so the drawing↔rule anchor
   (`recordDrawingAnchor`) and its rollback stay in one place; the builder only
   supplies the lifecycle fields. `DrawingAlertRequest` gains an optional
   lifecycle object, and the arm press supplies `Date.now()` plus a price read
   at that moment, not the price captured when the seed was created.
4. A drawing the core cannot express keeps today's behaviour: the action refuses
   and names the reason, exactly like an unexpressible indicator card.

An alternative worth rejecting explicitly: a small confirmation dialog with the
four fields, without touching the panel. It would be cheaper, but it is a second
authoring surface — the thing the epic exists to avoid — and it would drift from
the footer the moment the footer changes.

## Acceptance criteria

- [x] Selecting a drawing and using the bell in the chart's drawing overlay opens
      the panel on a Drawing tab, with the drawing's condition already in the
      draft. Right-clicking the chart still seeds the price alert; this item does
      not change that path.
- [x] The tab shows no editable condition — the level is the drawing's, rendered
      read-only — with the standard lifecycle footer below it.
- [x] Channels, frequency, expiry and note chosen in the footer are persisted on
      the rule; absent channels still mean "the policy decides", as everywhere
      else.
- [x] The drawing↔rule anchor is written exactly as today, and deleting the
      drawing still suspends the rule with the existing report
      (`reconcileDrawingRules`).
- [x] An unexpressible drawing refuses with its named reason and arms nothing.
- [x] `armDrawingAlert` remains the only writer of a drawing rule; the panel does
      not duplicate the document construction.
- [x] No second authoring surface is added: the chart does not grow its own
      channel picker.
- [x] German and English strings exist for the tab, its empty state and the
      tab's lead sentence (`dashboard.alerts.panel.drawing.lead`).

## Out of scope

- Editing an armed rule from Manage — `FEAT-0542`.
- Drawing types the alert core does not support; this item adds no condition.
- Per-rule external channels — `FEAT-0748`.
- The control center window — `FEAT-0749`.

## Result

Shipped in the builder: the chart's bell seeds a drawing draft instead of
arming it; the panel shows only the Drawing tab for that draft, with the
lifecycle footer; the arm press rebuilds the rule through `armDrawingAlert`
with the price of that moment, and reuses the draft's id so arming twice
replaces instead of duplicating.

Two places where the implementation differs from the Proposal above, recorded so
the next reader is not surprised:

- The seed still carries the condition `buildDrawingAlert` produced. It is the
  snapshot the shell needs to render a complete document; `drawingDraft` holds
  the binding, and the arm press rebuilds from the live line.
- The shell's plain-language sentence is hidden for a drawing draft, because
  the snapshot is not what the arm press stores. The tab's lead and level row
  are the readable form.

Pinned by `createDrawingAlert.test.ts` (the lifecycle and the id reach the
store), `alertPanel.seed.test.ts` (the drawing survives the mount and does not
return on the next open), `AlertPanelView.component.test.ts` (the tab, the fixed
header, the fresh price and every refusal), `DrawingTab.component.test.ts` (the
fixed level, the moving line, the deleted drawing) and
`drawingAlertEntry.test.ts` (the chart seeds instead of arming).

## Decisions recorded by the implementation

- The header's symbol field is fixed while a drawing draft is open, so the
  alert cannot silently target a market other than the line's. Price source and
  evaluation mode are fixed too: `buildDrawingAlert` reads neither, and an
  editable control that changes nothing is a lie.
- The arm press reads `marketState`'s `lastPrice` for the drawing's symbol —
  the shared ticker, not the chart's kline close the bell used — and refuses a
  stale quote rather than picking a side from it.
- A chart timeframe the panel does not list (30m, 6h, …) is rendered as an
  extra option, so the anchor the rule will use stays visible.

## Links

- `src/services/alertEngine/createDrawingAlert.ts` — `armDrawingAlert`, the
  document it builds
- `src/lib/windows/implementations/CandleChartView.svelte` — the direct call
  being replaced
- `src/stores/alertPanel.svelte.ts` — `AlertPanelSeed`, `ALERT_PANEL_TABS`
- `src/components/alerts/RuleLifecycleFields.svelte` — the footer to reuse
- `src/components/alerts/tabs/DrawingTab.svelte` — the read-only tab this item added
- [`FEAT-0623`](FEAT-0623-audit-super-alert-system-gaps-and-design.md) —
  the audit that produced this item
- [`FEAT-0389`](FEAT-0389-super-alert-panel.md) — the panel
- [`docs/backlog/assets/FEAT-0623/alert-system-audit.md`](../assets/FEAT-0623/alert-system-audit.md)
