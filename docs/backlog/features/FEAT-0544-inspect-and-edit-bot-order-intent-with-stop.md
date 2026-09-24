---
id: FEAT-0544
title: Inspect and edit bot order intent including stop-loss
type: feature
status: ready
priority: P1
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
---

# FEAT-0544 — Inspect and edit bot order intent including stop-loss

## Problem

In Settings → Automation a trader can promote an alert to a bot but can
neither see nor change what the bot will actually do. The promote dropdown
lists only `name — symbol` with no condition summary; after promotion the bot
list shows name, symbol and condition sentence but no order intent
(side/size basis/size/stop). There is no path anywhere to define a stop-loss
for a bot, change it, or correct it — which, combined with BUG-0541, means
every promoted bot is born non-submittable and stays that way with no UI
telling the trader.

## Proposal

1. Show the order intent on each bot row: side, size basis, size and stop
   distance. `renderRuleSentence` already renders this via `formatLead` +
   `stopSuffix` for `simulate` documents (`sentenceOf(bot)`), so wire the
   existing sentence through instead of a new phrasing; verify the
   `simulateOrder` lead keys read correctly in both locales.
2. Show the source alert's condition summary in the promote dropdown row
   (condition sentence, timeframe), so the trader knows *which* alert they are
   promoting before choosing side/size/stop.
3. Add an edit flow for a bot's order intent (side, size basis, size, stop
   distance as `percent_of_entry`), re-validated through the core
   (`ruleSchema.validate`) before `armRule` writes it back under the same id.
   `percent_risk` without a stop stays refused.
4. New bots come back disarmed (existing `promoteAlertToBot` behaviour);
   enabling stays the trader's separate act.

Note for implementers: no take-profit exists in the model (`OrderIntent` has
no TP field; `submitBotOrder` sends `takeProfits: []` deliberately), so the
edit form must not offer one.

## Acceptance criteria

- [ ] Each bot row displays side, size basis, size and stop distance in both
  locales; a bot without a stop reads as "no stop — will not submit"
- [ ] The promote dropdown identifies each alert by condition summary, not
  just name and symbol
- [ ] Editing a bot's stop distance and size re-validates via the core and
  persists under the same rule id; the updated sentence reflects the change
- [ ] `percent_risk` without a stop is refused with a field-anchored message,
  unchanged core behaviour
- [ ] New UI strings exist in both `src/locales/locales/de.json` and
  `en.json`

## Out of scope

- Making promotion itself require a stop (BUG-0541 — the guard; this item is
  the inspection/edit surface)
- Take-profit, trailing stops, ATR-based stop distances (new `StopDistance`
  basis members are their own items)
- Live sending (`send` level, FEAT-0035); this tab stays `simulate`-only and
  paper-trading-gated

## Open questions

None blocking. Whether editing the order intent changes the content hash (and
thus journal linkage) must be stated in the PR, mirroring how `setBotEnabled`
documents hash-excluded `enabled`.

## Links

- `src/components/settings/tabs/AutomationTab.svelte` (bot list, promote form)
- `src/services/alertEngine/promoteAlert.ts` (`promoteAlertToBot`)
- `src/services/alertEngine/botStore.ts` (`isBot`, `readBots`, `setBotEnabled`)
- `src/services/alertEngine/botOrders.ts` (`submitBotOrder`, `stopPriceFor`)
- `src/lib/rules/ruleSentence.ts` (`formatLead`, `stopSuffix` — reuse)
- `src/lib/rules/types.ts` (`OrderIntent`, `StopDistance`, `SizeBasis`)
- Sibling: BUG-0541 (mandatory stop at promote time)
