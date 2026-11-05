---
id: FEAT-0800
title: Move Trading settings help text into tooltips
type: feature
status: in-progress
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: feature/feat-0800-settings-trading-tooltips
---

# FEAT-0800 — Move Trading settings help text into tooltips

## Problem

The Trading settings tab and the panels it hosts (Risk Limits, Confirmations,
Notifications, External Channels, Paper Trading, Order Audit) render most of
their explanatory copy as permanently visible paragraphs under every field.
The result is a wall of text: labels are hard to scan, related controls drift
apart, and the actual values disappear between sentences. The explanations are
useful once and noise afterwards.

The same is true for the trading section of the Super-Alert panel and the Bots
tab, which are separate waves; each gets its own backlog item when it starts.

## Proposal

Reuse the tooltip infrastructure that already exists (`InfoTip.svelte`,
`Tooltip.svelte`, the `tooltip*` locale-key convention). No new popover or
modal component.

- Attach an `InfoTip` to the label of every setting whose explanation moves.
- Texts longer than ~180 characters or more than two sentences are shortened
  to a visible one-line summary first; the full text stays available in the
  tooltip.
- `settingsState.showTooltips` remains the single switch. With tooltips off the
  marker disappears instead of staying as a dead icon, and every control keeps
  a visible label.
- Safety, status, validation and destructive-confirmation text stays visible
  and is never moved behind a tooltip.
- An `InfoTip` never sits inside a `<label>` that wraps a control: a click on
  the marker would otherwise be forwarded to the control and flip the setting.

### Texts that move to a tooltip

| File | Keys |
|---|---|
| `settings/tabs/TradingTab.svelte` | `settings.feePreferenceDesc`, `settings.feeRatesDesc`, `settings.stalePriceBadgeDesc`, `settings.brokenAlertReportDesc`, `settings.trading.journalPaperTradesDesc` |
| `settings/RiskLimitsSettings.svelte` | `settings.risk.limitsDescription`, `settings.risk.maxPositionSizePercentHint`, `settings.risk.maxLeverageHint`, `settings.risk.maxLossPerTradeHint`, `settings.risk.maxDailyLossHint`, `settings.risk.maxOpenPositionsHint`, `settings.risk.killSwitch.description`, `blockAdds.hint`, `blockModifies.hint`, `autoEngage.hint`, `settings.risk.closeAll.description` |
| `settings/PaperTradingSettings.svelte` | `settings.paper.modeDescription`, `settings.paper.slippageHint`, `settings.paper.partialRatioHint`, `settings.paper.startingBalanceHint`, `settings.paper.feeHint` |
| `settings/NotificationSettings.svelte` | `settings.notifications.soundIntro` |
| `settings/ExternalChannelSettings.svelte` / `ExternalChannelCard.svelte` | `settings.externalChannels.intro`, `settings.externalChannels.email.hint`, `discord.hint`, `telegram.hint` |
| `settings/OrderAuditSettings.svelte` | `settings.audit.description`, `settings.audit.retention` |

### Texts that stay visible

- `settings.paper.confirmOnMessage`, `settings.paper.confirmOffMessage`,
  `settings.paper.resetMessage` — money-moving consequences.
- `settings.paper.failureDescription` — the only explanation that the chosen
  failure applies to the next order; a tooltip would make the selector read
  like a log filter.
- `settings.notifications.soundLocked`, `settings.notifications.permissionDenied`
  — instructions the user has to act on.
- `settings.notifications.connectionNote` — explains an intentional omission
  from the list; an absence cannot be discovered by hovering its explanation.
- `settings.externalChannels.storageWarningShort` — the security fact and the
  device advice; the full wording stays in the tooltip.
- `settings.risk.closeAll.descriptionShort` — shortened warning, full text in
  the tooltip.
- `settings.risk.limitsClosingNote` — limits never block closing or cancelling;
  shortened out of `limitsDescription`.
- `settings.risk.killSwitch.confirmEngage.hint` — "a release always asks".
- `settings.risk.killSwitch.scopeCaption` — labels the scope list as the state
  that applies while the switch is engaged.
- `settings.audit.retentionShort` — the Local-First promise on the screen that
  offers a JSON export.
- `settings.feeRatesNote` — the instruction to use the broker's own rates.
- `settings.confirmations.verificationNote`, `settings.confirmations.notWired`,
  `settings.audit.clearMessage` — security/status statements.
- Every validation error, refusal and persisted-state warning.

## Acceptance criteria

- [ ] Every key in the "move to a tooltip" table is no longer rendered as a
      permanently visible paragraph; it is reachable through an `InfoTip` or
      `Tooltip` attached to the field it explains.
- [ ] Every key in the "stay visible" list is still rendered as visible text,
      shortened where the table says so, with the full text in the tooltip.
- [ ] No new popover, modal or expandable component is introduced.
- [ ] `de.json` and `en.json` carry the same keys; no unused tooltip keys are
      left behind.
- [ ] With `showTooltips` off, every control still has a visible label and the
      tab is usable.
- [ ] Targeted component tests for the touched components pass.
- [ ] `npm run check` reports no new errors for the touched files.

## Out of scope

- Visuals, Chart, AI, Connections, System, Cloud and Automation settings.
- The Super-Alert panel and the Bots tab (separate waves).
- Rewriting copy beyond the shortening needed to fit a tooltip.
- Layout or density changes.

## Open questions

None.

## Links

- `src/components/shared/InfoTip.svelte`
- `src/components/shared/Tooltip.svelte`
- `src/components/settings/tabs/TradingTab.svelte`
- `src/components/settings/RiskLimitsSettings.svelte`
- `src/components/settings/PaperTradingSettings.svelte`
- `src/components/settings/NotificationSettings.svelte`
- `src/components/settings/ExternalChannelSettings.svelte`
- `src/components/settings/OrderAuditSettings.svelte`
- PR: #4533 (open, waiting for review)
