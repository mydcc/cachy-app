---
id: BUG-0066
title: Position tooltip labels the live unrealized PnL row "Realized PnL"
type: bug
status: done
priority: P2
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
estimate: 3
size: M
target_date: 2026-10-31
---

# BUG-0066 — Position tooltip labels the live unrealized PnL row "Realized PnL"

## Symptom

Reported live, with a screenshot: the position tooltip
(`PositionTooltip.svelte`) shows two rows both labeled "Realized PnL" —
one green (bound to the position's live PnL) and one red/negative
(bound to the actual cumulative realized PnL). User's own read: "Warum
sehe ich einen positiven und einen negativen PnL? Der grüne wäre der
Unrealized PnL" — correctly suspecting the green row is mislabeled.

## Evidence

**Demonstrated** — traced to the exact shared i18n key.

`PositionTooltip.svelte`'s first PnL row (bound to
`position.unrealizedPnl`) used the translation key
`dashboard.orderHistory.details.pnl`. That key's English/German values are
literally `"Realized PnL"` / `"Realisierter PnL"`
(`src/locales/locales/{en,de}.json`) — correct for its original owner,
`OrderDetailsTooltip.svelte`, where a filled order's PnL genuinely *is*
realized (an order has no "unrealized" state). Reusing the same key for a
still-open position's PnL mislabeled a genuinely unrealized value as
realized, directly beside the tooltip's other row
(`positionsList.realizedPnl`, correctly labeled) showing the *actual*
realized PnL — hence two differently-signed numbers under the same label.

## Cause

Key reuse across two components with different semantics for "PnL".

## Fix

`PositionTooltip.svelte`'s unrealized PnL row now uses
`positionsList.unrealizedPnl` (already present, previously unused —
`docs/backlog/features/FEAT-0057-market-activity-panel-redesign.md`'s
margin-rate/realized-PnL work added the sibling `realizedPnl` key but this
one was never wired up). Both locale values updated from the terse "uPnL"
to "Unrealized PnL" / "Unrealisierter PnL" for consistency with the
tooltip's other full-word labels ("Realized PnL", "Margin Rate").

Also added a `title` tooltip on the clickable PnL badge in
`PositionsList.svelte` (both view modes) explaining what the number is and
that clicking cycles between value/percent/bar display — previously
undocumented UI, flagged by the same report.

## Acceptance criteria

- [x] The position tooltip's live-PnL row is labeled "Unrealized PnL", not
      "Realized PnL"
- [x] The PnL badge on a position card has a hover tooltip explaining its
      meaning and the click-to-cycle behavior
- [x] `npm run check`, `scripts/check_translations.sh`, and the full
      Vitest suite pass

## Links

- `src/components/shared/PositionTooltip.svelte`
- `src/components/shared/PositionsList.svelte` — `togglePnlMode()`
- `src/locales/locales/en.json`, `de.json` — `positionsList.*`
