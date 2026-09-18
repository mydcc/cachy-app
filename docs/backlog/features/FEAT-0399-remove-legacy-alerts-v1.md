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

## Gate check (2026-09-18)

Checked rather than assumed: the item above asks for the readiness conditions to be
restated *with evidence* instead of re-decided at close time, so this is that evidence
as it stands. **Both conditions are still open, so this item stays `idea`.**

| Condition | Met | Evidence |
| --- | --- | --- |
| `FEAT-0388` shipped to a stable release | no | That item carries `shipped: 1.6.0-beta.261`, and 1.6.0 is marked `(unreleased)` in `CHANGELOG.md`. The last stable release is 1.5.0 (2026-08-12); every tag since is a `v1.6.0-beta.*`. |
| …plus one full milestone in production, no migration regression | no | Cannot start before the release above. `origin/main` stands at `1.6.0-beta.92` and does not contain `src/services/alertEngine/migrateAlertsToRules.ts` at all, so the migration has not run anywhere but `develop`. |
| `FEAT-0389` (Super-Alert panel) shipped | not in that sense | `status: done`, milestone M4 — but on `develop` only, inside the same unreleased 1.6.0. |

The trap this table exists to prevent: `FEAT-0388` and `FEAT-0389` both read
`status: done`, which is easy to read as "in production". In this backlog `done` means
merged to `develop`. What this item authorises is deleting the only fallback a
migration regression could be recovered from, so "merged" is not the bar its first two
criteria are asking for.

Re-check when 1.6.0 leaves beta. The cheap test for the second row is whether
`migrateAlertsToRules.ts` exists on the released branch — not whether the item says
`done`.

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
