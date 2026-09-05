---
id: FEAT-0388
title: Migrate stored price alerts to rule documents
type: feature
status: specced
priority: P1
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0387]
size: S
estimate: 2
---

# FEAT-0388 — Migrate stored price alerts to rule documents

## Problem

Armed alerts are stored as `AlertDefinition { id, symbol, condition: { price_reached },
active }` under `cachy_alerts_v1`. Once the app evaluates `RuleDocument`s, those stored
alerts stop being evaluated by anything. A trader who armed an alarm before the update
and never notices it went quiet is the same failure as `BUG-0382`, only caused by us.

## Proposal

Migrate on first load, once, losslessly.

`technicals-wasm/src/rule/legacy.rs` and its export `rule_from_alert_json` already
exist — `FEAT-0303` built them for exactly this. This item calls them: read
`cachy_alerts_v1`, convert each definition, write `cachy_rules_v1`, keep the old key
untouched as a fallback until a later release removes it.

Migrated rules arrive at `consequence_level: notify` with
`provenance.source: human` — they were armed by the trader, not proposed.

Once the rule engine is live, the legacy engine stops reading `cachy_alerts_v1`; the old
key becomes a dormant fallback and a future release may remove it. This prevents double-fire
(migrated alert firing once from the new engine, once from the legacy path).

Class A throughout: the conversion happens on the device and nothing is reported
anywhere.

**Reconciliation ledger.** After migration, `cachy_rules_v1` and `cachy_alerts_v1` are
allowed to drift: the trader can delete a migrated rule from the Manage tab, or arm new
rules unrelated to any legacy alert. That makes "does this legacy alert have a matching
rule" unreliable in both directions — a missing rule can mean either "never migrated" or
"migrated, then the trader deleted it," and those are not the same event. The migration
therefore also writes `cachy_alerts_migrated_v1`, an append-only `Set<legacy alert id>`
recording which ids were successfully converted, independent of what later happens to
`cachy_rules_v1`. Whether "migrated, then deleted" should also drop the alert from
`cachy_alerts_v1` is a **product decision**, not an engineering one — it depends on
whether a trader expects a deleted rule to reappear on a fresh install or a second
device. That decision is out of scope here and belongs to whichever milestone plans the
`cachy_alerts_v1` removal (see Out of scope); this item only guarantees the ledger this
decision will need exists. A safe removal of `cachy_alerts_v1` later only ever has to
check "is every id in `cachy_alerts_v1` present in `cachy_alerts_migrated_v1`?" — it
never has to look at the current, possibly-edited state of `cachy_rules_v1`.

## Acceptance criteria

- [ ] Every alert stored under `cachy_alerts_v1` exists as a valid `RuleDocument` in
      `cachy_rules_v1` after one load, with the same symbol and threshold
- [ ] A fired (`active: false`) alert migrates as history, not as an armed rule
- [ ] The migration runs once; a second load does not duplicate rules
- [ ] `cachy_alerts_v1` is left in place, and the release that removes it is named in
      this item before it happens
- [ ] A malformed stored entry is skipped with a logged reason and does not abort the
      migration for the remaining entries
- [ ] No migrated rule carries a `consequence_level` above `notify`
- [ ] Every successfully migrated legacy id is recorded in `cachy_alerts_migrated_v1`,
      and that record is unaffected by later edits or deletions in `cachy_rules_v1`

## Out of scope

- Deleting `cachy_alerts_v1`. A later release, once the migration has shipped — that
  release also decides whether a rule the trader deleted post-migration should remove
  the legacy entry too, using `cachy_alerts_migrated_v1` to tell "never migrated" apart
  from "migrated, then deleted" before it does.

## Links

- [`FEAT-0387`](FEAT-0387-expose-rule-evaluator.md)
- [`FEAT-0027`](FEAT-0027-alert-engine.md) — the alerts being migrated
- [`BUG-0382`](../bugs/BUG-0382-alert-engine-never-initialised.md) — a stored alert that silently never fires
- `technicals-wasm/src/rule/legacy.rs`, `src/stores/alerts.svelte.ts`
