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
tab, which are tracked as separate waves (FEAT-0801, FEAT-0802).

## Proposal

Reuse the tooltip infrastructure that already exists (`InfoTip.svelte`,
`Tooltip.svelte`, the `tooltip*` locale-key convention). No new popover or
modal component.

- Attach an `InfoTip` to the label of every setting whose explanation moves.
- Texts longer than ~180 characters or more than two sentences are shortened
  to a visible one-line summary first; the full text stays available in the
  tooltip.
- `settingsState.showTooltips` remains the single switch: with tooltips off,
  every control is still labelled and usable.
- Safety, status, validation and destructive-confirmation text stays visible
  and is never moved behind a tooltip.

### Texts that move to a tooltip

| File | Keys |
|---|---|
| `settings/tabs/TradingTab.svelte` | `settings.feePreferenceDesc`, `settings.feeRatesDesc`, `settings.stalePriceBadgeDesc`, `settings.brokenAlertReportDesc`, `settings.trading.journalPaperTradesDesc` |
| `settings/RiskLimitsSettings.svelte` | `settings.risk.limitsDescription`, `settings.risk.maxDailyLossHint`, the four `*PercentHint` / `*LeverageHint` / `*LossPerTradeHint` / `*DailyLossHint` field hints, `settings.risk.killSwitch.description`, `blockAdds.hint`, `blockModifies.hint`, `confirmEngage.hint`, `autoEngage.hint` |
| `settings/PaperTradingSettings.svelte` | `settings.paper.modeDescription`, `settings.paper.slippageHint`, `settings.paper.failureDescription`, `settings.paper.partialRatioHint` |
| `settings/NotificationSettings.svelte` | `settings.notifications.soundIntro`, `settings.notifications.connectionNote` |
| `settings/ExternalChannelSettings.svelte` | `settings.externalChannels.intro`, `email.hint`, `discord.hint`, `telegram.hint` |
| `settings/OrderAuditSettings.svelte` | `settings.audit.description`, `settings.audit.retention` |

### Texts that stay visible

- `settings.paper.confirmOnMessage`, `settings.paper.confirmOffMessage`,
  `settings.paper.resetMessage` — money-moving consequences.
- `settings.notifications.soundLocked`, `settings.notifications.permissionDenied`
  — instructions the user has to act on.
- `settings.externalChannels.storageWarning` — shortened to the security fact,
  remainder in the tooltip.
- `settings.risk.closeAll.description` — shortened, remainder in the tooltip.
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
