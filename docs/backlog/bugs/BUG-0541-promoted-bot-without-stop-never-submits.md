---
id: BUG-0541
title: Promoted bot without stop can never submit and fails silently as no-stop
type: bug
status: done
shipped: unreleased
priority: P1
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
---

# BUG-0541 — Promoted bot without stop can never submit and fails silently as no-stop

## Symptom

A trader promotes an alert to a bot in Settings → Automation, arms it, and the
bot fires but never places an order. The only trace is a once-per-rule log line
(`bot <id> fired but submitted nothing: no-stop`); the UI shows the bot as a
normal armed strategy with no indication it can never act.

## Evidence

**Derived** — the defect follows from reading two pieces of code that disagree
about who supplies the stop:

- `src/components/settings/tabs/AutomationTab.svelte` (`promote()`) builds the
  order as `{ side, size_basis, size }` — no `stop` field exists on the form,
  so every promoted bot carries `action.order.stop === undefined`.
- `src/services/alertEngine/botOrders.ts` (`submitBotOrder`) returns
  `"no-stop"` when `!order.stop`, and `withBotOrders` reports each reason once
  via `logRefusal` only — no toast, no badge, no list marking.

`src/lib/rules/types.ts` (`OrderIntent.stop?`) documents the stop as optional
for pre-existing documents, and the core refuses `percent_risk` without one —
so the submission path is the only place the missing stop surfaces, at fire
time instead of at promote time.

## Cause

The promote form predates the stop requirement: it collects side/size but never
a `StopDistance`, and nothing validates the derived document for submittability
before arming it disarmed-but-activatable.

## Fix

Decided (user triage): stop-loss is mandatory for bots.

1. Add a stop-distance field (`percent_of_entry`, percent of entry price) to the
   promote form in `AutomationTab.svelte`; refuse promotion without it with a
   field-anchored refusal, the way `size` refusals already work.
2. Mark already-stored bots without a stop in the bot list as
   "no stop — will not submit" (sentence renders without a stop clause today
   via `stopSuffix`, so the gap is visible in `renderRuleSentence` output).
3. Leave the submission path (`no-stop` refusal) untouched as the second net.

Do not invent take-profit: `OrderIntent` has no TP field and `submitBotOrder`
sends `takeProfits: []` deliberately.

## Acceptance criteria

- [x] A test promotes an alert without a stop and asserts the promotion is
  refused (or the resulting bot is flagged non-submittable) before any firing
- [x] A test promotes an alert with a stop and asserts `submitBotOrder` no
  longer returns `no-stop` for it
- [x] The bot list visibly distinguishes bots without a stop from submittable
  ones in both locales (DE/EN strings exist)
- [x] `percent_risk` without a stop is still refused by the core, unchanged

## Links

- `src/components/settings/tabs/AutomationTab.svelte` (promote form, bot list)
- `src/services/alertEngine/botOrders.ts` (`submitBotOrder`, `withBotOrders`)
- `src/services/alertEngine/promoteAlert.ts` (`promoteAlertToBot`)
- `src/lib/rules/types.ts` (`OrderIntent`, `StopDistance`)
- `src/lib/rules/ruleSentence.ts` (`stopSuffix`, `formatLead`)
- Sibling: FEAT-0544 (inspect and edit bot order intent incl. stop)
