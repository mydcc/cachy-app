---
id: FEAT-0401
title: Record a migration origin ledger for rules converted from legacy alerts
type: feature
status: in-progress
assignee: claude
branch: worktree-migrate-alerts-to-rules-47d8cf
priority: P1
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0388]
size: S
estimate: 2
start_date: 2026-09-05
---

# FEAT-0401 — Record a migration origin ledger for rules converted from legacy alerts

## Problem

`FEAT-0388` converts every alert in `cachy_alerts_v1` into a rule in `cachy_rules_v1`.
A migrated rule is indistinguishable from one a trader authored by hand: both carry
`provenance.source: human`, because both were in fact armed by a human.

That is fine until an alert is deleted. `removeAlert()` drops it from
`cachy_alerts_v1` and the legacy engine forgets it — but the migrated rule stays in
`cachy_rules_v1`, still `enabled`. At the `FEAT-0387` cutover it starts firing for a
level the trader cleared away, possibly months earlier. The trader has no way to
connect the notification to anything they can see: the alert it came from is gone
from the UI.

The migration itself cannot fix this. Its own doc comment says so:

> nothing here can safely tell a migrated-then-orphaned rule apart from one a future
> rule editor authored directly

That is the whole problem in one sentence — and it is a problem of *missing evidence*,
not of missing logic. The migration is the only place that ever knows a rule came
from an alert, and today it discards that fact the moment it writes the rule.

## Proposal

Record the fact instead of discarding it.

When the migration converts an alert, it appends an entry to a ledger under a new
Class A key, `cachy_rule_origin_v1`:

```jsonc
{
  "schema_version": 1,
  "entries": {
    "<ruleId>": { "alertId": "<alertId>", "migratedAtMs": 1757068800000 }
  }
}
```

That is enough for a later reader to answer the only question that matters:

- rule id **in** the ledger, alert **gone** from `cachy_alerts_v1` → migrated, then
  orphaned. Safe to act on.
- rule id **not** in the ledger → authored directly. Never touch it.

`alertId` is recorded even though the conversion currently reuses the alert's id as
the rule id (`legacy.rs`: `id: alert.id.clone()`). The ledger states the relationship
rather than depending on that equality holding forever; a future rule editor that
re-keys documents would otherwise silently turn every entry into a self-reference of
unknown meaning.

Deliberately *not* in scope here: deciding what "act on" means. Disabling, dropping,
or surfacing an orphan is the cutover's call (`FEAT-0387`), and it needs this evidence
to make it. This item supplies the evidence and nothing else.

The ledger is **append-only**. A run never prunes an entry whose alert has vanished,
because that entry *is* the orphan record — pruning it would destroy exactly the
evidence the ledger exists to preserve, and do it silently. Entries are small and
bounded by the number of alerts a trader ever armed.

Class A throughout: written on the device, read on the device, never reported
anywhere. A ledger of which price levels someone watched is user data.

## Acceptance criteria

- [x] Every rule the migration newly writes to `cachy_rules_v1` gains a
      `cachy_rule_origin_v1` entry keyed by its rule id, in the same run
- [x] A rule that already existed before this item ships (migrated by `FEAT-0388`
      without a ledger) is back-filled on the next run when its alert is still
      present in `cachy_alerts_v1`
- [x] An entry is never removed or rewritten once written, including when its alert
      disappears from `cachy_alerts_v1`
- [x] A rule authored directly (not present in the ledger) is left untouched and
      unrecorded by every code path in this item
- [x] A malformed or unparseable `cachy_rule_origin_v1` is treated as empty and
      rebuilt, with a logged reason, without aborting the migration
- [x] Ledger writing never throws out of `migrateAlertsToRuleDocuments()` — a ledger
      failure must not cost the trader the migration itself
- [x] The ledger is written only for alert-derived rules; nothing in it is sent
      anywhere (Class A)

## Out of scope

- Acting on an orphaned rule — disabling, dropping, or surfacing it. That is
  `FEAT-0387`'s cutover decision, and it is the consumer of this ledger.
- Threshold drift between an alert and its already-migrated rule. The migration
  currently re-syncs only `enabled`, so editing an alert's price after migration
  leaves the rule at the old level. Tracked as [`BUG-0402`](../bugs/BUG-0402-migrated-rule-keeps-stale-threshold.md) — it is a correctness bug in
  the migration, not a gap in provenance, and bundling the two would put an
  evaluation-correctness fix and a bookkeeping addition in the same review.
- Removing `cachy_alerts_v1`. Unchanged from `FEAT-0388`: `M5` at the earliest.

## Links

- [`FEAT-0388`](FEAT-0388-migrate-alerts-to-rule-documents.md) — writes the rules this ledger describes
- [`FEAT-0387`](FEAT-0387-expose-rule-evaluator.md) — the cutover that consumes it
- [`BUG-0382`](../bugs/BUG-0382-alert-engine-never-initialised.md) — the silent-never-fires failure this prevents a new variant of
- `src/services/alertEngine/migrateAlertsToRules.ts`, `src/lib/rules/types.ts`
