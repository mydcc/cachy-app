---
id: FEAT-0399
title: Remove the legacy cachy_alerts_v1 store and evaluation path
type: feature
status: idea
priority: P3
milestone: M5
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0388, FEAT-0389]
---

# FEAT-0399 — Remove the legacy cachy_alerts_v1 store and evaluation path

## Problem

`FEAT-0388` keeps `cachy_alerts_v1` in place as a dormant fallback after migrating its
entries into `cachy_rules_v1`, deliberately — see that item's "Out of scope". Once the
migration has shipped and soaked in production, `cachy_alerts_v1`, the legacy
`AlertEngineWasm` evaluation path, and the legacy creation form in
`AlertDefinitionsModal.svelte` become dead weight: a second, unused code path a trader
could still accidentally exercise, and storage nothing reads except the migration
itself. Nobody has a trigger to actually remove it, so without an explicit item it
stays "temporary" indefinitely.

## Proposal

Delete `cachy_alerts_v1` reads and writes, the legacy `AlertEngineWasm` evaluation path,
and `AlertDefinitionsModal.svelte`'s alert-creation form (or the component entirely, if
its Manage/history view has been superseded by the `FEAT-0389` panel by then). Keep
whatever history the panel still needs to show by that point — if `cachy_rules_v1`
already carries fired history for migrated rules (per `FEAT-0388`'s acceptance
criteria), nothing here needs to migrate history again.

This item does not start until both readiness conditions below hold, and should
restate them as satisfied (with evidence — a release version, a date, an issue link)
rather than re-deciding them at close time.

## Acceptance criteria

- [ ] `FEAT-0388` has shipped to a stable release and had at least one full milestone
      in production with no reported regression tied to the migration
- [ ] `FEAT-0389` (the Super-Alert panel) has shipped, so removing the legacy creation
      form does not leave traders without any way to arm a price alert
- [ ] Every entry in `cachy_alerts_v1` is present in `cachy_alerts_migrated_v1` (per
      `FEAT-0388`) on every edition before the read/write path is deleted, not merely
      assumed
- [ ] `cachy_alerts_v1`, the legacy `AlertEngineWasm` path, and the legacy creation form
      are deleted, not merely dead-code-flagged
- [ ] No existing test still exercises the removed path; tests are deleted or migrated,
      not skipped

## Out of scope

- Deciding *whether* to remove `cachy_alerts_v1` — that was already decided in
  `FEAT-0388`. This item is the trigger and the execution once its gates are met.
- Any change to `cachy_rules_v1` or the rule evaluator themselves.

## Open questions

- Should a rule the trader deleted after migration (present in
  `cachy_alerts_migrated_v1` but absent from live `cachy_rules_v1`) cause its
  `cachy_alerts_v1` entry to be dropped silently, or surfaced once before removal? See
  `FEAT-0388`'s "Out of scope" note on this — unresolved there, inherited here.

## Links

- [`FEAT-0388`](FEAT-0388-migrate-alerts-to-rule-documents.md) — the migration and the
  `cachy_alerts_migrated_v1` reconciliation ledger this item's first acceptance
  criterion depends on
- [`FEAT-0389`](FEAT-0389-super-alert-panel.md) — the replacement UI this item's second
  acceptance criterion depends on
- [`FEAT-0387`](FEAT-0387-expose-rule-evaluator.md)
- `src/components/alerts/AlertDefinitionsModal.svelte`, `src/stores/alerts.svelte.ts`
