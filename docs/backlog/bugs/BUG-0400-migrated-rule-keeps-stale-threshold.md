---
id: BUG-0400
title: A migrated rule keeps the old price after its alert is edited
type: bug
status: specced
priority: P1
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0388]
---

# BUG-0400 — A migrated rule keeps the old price after its alert is edited

## Symptom

A trader arms an alert at 50 000, the migration converts it into a rule, and the
trader later edits the alert to 60 000. `cachy_alerts_v1` now says 60 000;
`cachy_rules_v1` still says 50 000. At the `FEAT-0387` cutover the rule fires at
50 000 — a level the trader deliberately moved away from — and nothing in the UI
explains why.

The direction that matters most is the one that costs money: an alert raised
because the trader no longer wants to be woken at the old level will still wake
them there, and an alert lowered to catch an earlier entry will fire late.

## Reproduction

1. Arm a price alert on `BTCUSDT` at `50000`.
2. Load the app once so `migrateAlertsToRuleDocuments()` writes the rule.
3. Edit the alert to `60000` (`alertState.updateAlert`).
4. Load the app again.
5. Read `cachy_rules_v1` — the rule's threshold is still `50000`.

Synthetic state after step 4:

```jsonc
// cachy_alerts_v1
[{ "id": "a1b2-demo", "symbol": "BTCUSDT", "condition": { "price_reached": "60000.0" }, "active": true }]
// cachy_rules_v1  — stale
[{ "id": "a1b2-demo", "symbol": "BTCUSDT", "conditions": { "right": { "value": "50000.0" } }, "enabled": true }]
```

## Cause

`migrateAlertsToRuleDocuments()` reconciles an already-migrated alert by id and then
syncs exactly one field — `enabled`, against the alert's `active` flag
(`migrateAlertsToRules.ts`, the `existingIndex !== undefined` branch). Every other
field, the threshold included, is written once at conversion and never revisited.
`FEAT-0388` was scoped to a one-time conversion, so this is a gap in that scope
rather than a regression against it.

## Expected

A rule that the ledger (`cachy_rule_origin_v1`, `FEAT-0399`) attributes to an alert
should either track that alert's condition for as long as both exist, or stop
claiming to represent it. Which of the two is a product decision and belongs in the
fix, not in this report:

- **Re-convert on drift** — the rule stays a mirror of the alert. Simple and
  predictable, but it silently overwrites a rule a trader may have since edited in a
  future rule editor.
- **Detect and surface** — leave both, tell the trader the two disagree. Safer for
  hand-edited rules, but leaves a wrong rule armed until someone acts.

The ledger added by `FEAT-0399` is what makes either option implementable: it is the
only thing that says this rule came from that alert.

## Notes

Not bundled into `FEAT-0399`. That item adds bookkeeping and touches no evaluation
behaviour; this one changes which price a rule fires at. Reviewing them together
would put a money-affecting change and a record-keeping change under one approval.

## Links

- [`FEAT-0388`](../features/FEAT-0388-migrate-alerts-to-rule-documents.md) — the one-time conversion this drifts from
- [`FEAT-0399`](../features/FEAT-0399-record-migration-origin-ledger.md) — the ledger a fix needs
- [`FEAT-0387`](../features/FEAT-0387-expose-rule-evaluator.md) — the cutover at which the stale rule starts firing
- `src/services/alertEngine/migrateAlertsToRules.ts`, `src/stores/alerts.svelte.ts`
