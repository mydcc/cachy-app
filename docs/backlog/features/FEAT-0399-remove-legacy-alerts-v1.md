---
id: FEAT-0399
title: Remove the legacy cachy_alerts_v1 store and evaluation path
type: feature
status: done
assignee: claude
branch: feat/feat-0399-drop-legacy-alerts
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
- [x] Every entry in `cachy_alerts_v1` is present in `cachy_alerts_migrated_v1` (per
      `FEAT-0388`) on every edition before the read/write path is deleted, not merely
      assumed — enforced per device by `verifyLegacyMigration.ts`, which runs after the
      migration on every start and reports `clean`, `unmigrated` (with ids) or
      `unreadable`, never folding the last into the first
- [x] `cachy_alerts_v1`, the legacy `AlertEngineWasm` path, and the legacy creation form
      are deleted, not merely dead-code-flagged — the creation form was already gone
      (`AlertDefinitionsModal.svelte` no longer exists); this item removed
      `alertEngine.ts`, `ruleCoverage.ts`, `legacyReplayCoordinator.ts`,
      `replayClosedCandles.ts` and the store's read/write path, 2 893 lines net
- [x] No existing test still exercises the removed path; tests are deleted or migrated,
      not skipped — `alerts_engineWiring.test.ts` was rewritten around the single
      engine, the BUG-0402 resync block was rewritten as the one-shot contract, and
      `ManageTab.component.test.ts` now seeds `cachy_rules_v1`

## Gate check (2026-09-18)

Checked rather than assumed: the item above asks for the readiness conditions to be
restated *with evidence* instead of re-decided at close time, so this is that evidence
as it stands. **Both conditions are still open.** The item was started anyway, on an
explicit decision by the repository owner on 2026-09-18 ("FEAT-0399 wird auch gemacht,
unabhängig von einer Versionsnummer. Ich entscheide das."). The table stays because it
is the evidence the item asked for, and because it records what was knowingly accepted
rather than overlooked.

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

The cheap test for the second row is whether `migrateAlertsToRules.ts` exists on the
released branch — not whether the item says `done`.

What the first two rows were protecting is that a migration regression, discovered after
release, could be recovered from the untouched legacy store. That protection is not
waived by starting early, because the deletion removes the *code* that reads and writes
`cachy_alerts_v1`, never the key: `migrateAlertsToRules.ts` stays as its last remaining
reader, and it is idempotent, so a device that migrates late still migrates. The residual
risk the owner accepted is narrower than the table suggests — a legacy alert that never
converted stops being evaluated, silently. That is exactly what the third criterion
asks to be proven rather than assumed, and what `verifyLegacyMigration.ts` now proves
per device.

## Out of scope

- Deciding *whether* to remove `cachy_alerts_v1` — that was already decided in
  `FEAT-0388`. This item is the trigger and the execution once its gates are met.
- Any change to `cachy_rules_v1` or the rule evaluator themselves.

## Open questions

- Should a rule the trader deleted after migration (present in
  `cachy_alerts_migrated_v1` but absent from live `cachy_rules_v1`) cause its
  `cachy_alerts_v1` entry to be dropped silently, or surfaced once before removal? See
  `FEAT-0388`'s "Out of scope" note on this — unresolved there, inherited here.

## How it was built (2026-09-18)

**The verification came first, and it is a mechanism, not a claim.**
`verifyLegacyMigration.ts` runs after the migration on every start and reports
`clean`, `unmigrated` (with ids) or `unreadable`. The third verdict is the point: an
unreadable store or ledger must never read as verified, and must never manufacture a
list of unmigrated ids out of a parse error — that would condemn every alarm a trader
has. An empty ledger beside a populated store *is* a real finding.

**The migration had to stop reading back before anything could be deleted.** It used to
re-sync an existing rule from its alert on every start: `enabled` from `active`, the
threshold on drift (BUG-0402). That was right while both stores had a live editor. With
the legacy editor gone the legacy entry is frozen, so re-reading it can only undo the
rule store — a rule disarmed after firing would be re-armed from an `active: true` flag
nothing can update, re-firing on every reload. The ledger now answers "has this alert
had its one conversion", which is what `FEAT-0388` built it for.

**`runLegacyHandoff()` covers the case the gate would otherwise strand.** While both
engines existed, `releaseCoverage()` disabled a migrated rule whenever its alert was
edited, and the legacy engine picked the alert up. Deleting that engine leaves those
rules parked with nothing evaluating them — BUG-0382's shape. Once per device, guarded
by its own marker, because afterwards a disabled migrated rule is the trader's decision.

**Manage was listing the wrong store, and the deletion is what surfaced it.** The panel
has armed *rules* since `FEAT-0389`, but the list read `cachy_alerts_v1` — so an alarm
armed in the panel never appeared in it at all. `alarmRows()` reads the rule set
directly, which is both the store that is written and the store that is evaluated.

**What deliberately stayed.** `migrateAlertsToRules.ts` is now the only reader of
`cachy_alerts_v1` and must not be deleted: a device that has never started the app since
its alerts were written still needs its one conversion. The localStorage key itself is
untouched — this item removed the code, never the bytes.

**Known leftover:** the translation key `dashboard.alerts.alertCondition` is now unused.
Left in place rather than removed here, per the repo rule on code of unclear purpose;
dead-translation cleanup is its own pass.

## Links

- [`FEAT-0388`](FEAT-0388-migrate-alerts-to-rule-documents.md) — the migration and the
  `cachy_alerts_migrated_v1` reconciliation ledger this item's first acceptance
  criterion depends on
- [`FEAT-0389`](FEAT-0389-super-alert-panel.md) — the replacement UI this item's second
  acceptance criterion depends on
- [`FEAT-0387`](FEAT-0387-expose-rule-evaluator.md)
- `src/components/alerts/AlertDefinitionsModal.svelte`, `src/stores/alerts.svelte.ts`
