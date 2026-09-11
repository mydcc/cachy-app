---
id: FEAT-0393
title: Trigger method, frequency, validity period and note per rule
type: feature
status: done
priority: P1
assignee: mydcc
resolved_at: 2026-09-11
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0387, FEAT-0389]
size: M
estimate: 5
---

# FEAT-0393 — Trigger method, frequency, validity period and note per rule

## Problem

An alert today fires once and disarms itself, on every channel, forever, with no note
saying why it was armed. Three things are missing and each of them is the difference
between a useful alarm and a muted one:

- **Frequency.** A support level a trader wants to hear about every time it is touched
  currently has to be re-armed by hand after each touch.
- **Validity period.** A setup that was interesting this week is noise next month, and
  nothing expires it.
- **Note.** Two weeks later, "BTCUSDT above 72000" does not say whether it was an entry,
  an invalidation, or a reminder.

## Proposal

Four fields on the rule, shown in the same footer in every builder tab:

| Field | Values |
|---|---|
| Trigger method | Which `notificationService` channels announce it |
| Frequency | Once · every time · once per candle close |
| Validity period | An expiry timestamp; the rule expires **without** firing |
| Note | Free text, Class A, shown in Manage and in the announcement |

**This changes the schema.** These are per-rule lifecycle fields, not part of what the
rule *means*, so they must not alter the content hash — two rules that differ only in
frequency are still the same strategy in a journal entry. That makes this a
`SchemaVersion` bump plus a migration in `technicals-wasm/src/rule/version.rs`, plus an
addition to `EXCLUDED_FROM_HASH` in `document.rs`. The test
`only_labelling_fields_are_excluded_from_the_hash` pins that list deliberately and will
fail until it is updated — that failure is the design working, not an obstacle.

Note that `canonical_value()` *removes* an excluded list rather than assembling an
included one, so a new field is hashed by default. Getting this wrong is a loud test
failure, not a silent audit hole.

## Acceptance criteria

- [x] Frequency `once` disarms after firing; `every time` stays armed; `once per candle
      close` fires at most once per closed trigger candle
- [x] A rule past its validity period expires and does **not** fire, and Manage shows it
      as expired rather than as fired — core reports `Verdict::Expired`, distinct from
      `AlreadyFired`; the Manage rendering is still open (see "Still open")
- [x] Two rules differing only in frequency, validity or note have the **same** content hash
- [x] Two rules differing in symbol, timeframe, conditions or consequence level have
      **different** content hashes
- [x] A document written at the previous schema version migrates and keeps its hash
- [x] The note appears in the announcement on every channel that can carry text
      (delivered by [`FEAT-0440`](FEAT-0440-real-firing-sink.md))
- [x] German and English strings

## Out of scope

- Snooze and per-rule cooldown. Related, but a separate decision.

## Resolved while building (2026-09-11)

- **"Once per candle close" means the trigger timeframe's candle.** Settled in
  `lifecycle::TriggerFrequency::OncePerCandleClose`: it is the only candle the rule is
  already anchored on, so counting against it needs no second notion of "now".

- **`schema_version` had to leave the hash.** It was hashed at v1, so a migrated
  document could not possibly keep its hash and AC 5 was unsatisfiable as written. It is
  now in `EXCLUDED_FROM_HASH`: how a document is *encoded* is not what it says. This is
  affordable exactly once, before any rule is live on a funded account.

- **Expiry and frequency read the anchor candle's close instant, not a wall clock.**
  `evaluate` is pure by design; taking a clock reading inside it would make a backtest
  expire every rule against today's date. `RuleState` is passed in by whoever owns the
  store for the same reason.

- **The four fields are flat on `RuleDocument`, not nested in a `lifecycle` object.**
  `canonical_value()` excludes by key name, so a nested bag would be one entry in
  `EXCLUDED_FROM_HASH` and anything added inside it later would go unhashed in silence.

## Blockers — resolved by [`FEAT-0440`](FEAT-0440-real-firing-sink.md) (2026-09-11)

These ACs were complete in the core and needed a real `FiringSink` to surface. All three
shipped with FEAT-0440:

- **AC 6 — The note in the announcement.** Done. `notifyingRuleSink` routes through
  `notificationService` on the new `alert-fired` category, and `firingMessage()` appends
  the trader's note.

- **AC 2 — Manage rendering for expired rules.** Done. `ruleLifecycleView.ts` joins legacy
  alert ids to their rules; `ManageTab.svelte` badges an expired rule as expired. An
  expired rule is deliberately *not* disarmed — that would drop it into the history list,
  where every row reads "fired".

- **Runtime `RuleState` wiring.** Done. `ruleStateStore.ts` owns fire state in
  `cachy_rule_state_v1`; the loop takes a `readRuleState` reader and populates
  `EvaluationContext.state`. This also fixed a live defect: the sink disarmed
  unconditionally, so `every_time` and `once_per_candle_close` behaved as `once`.

- [`FEAT-0397`](FEAT-0397-notification-channels.md) — notification channel configuration
## Links

- [`FEAT-0392`](FEAT-0392-notification-sound-channel.md) — the channels a trigger method picks from
- [`FEAT-0389`](FEAT-0389-super-alert-panel.md) — the footer these fields live in
- `technicals-wasm/src/rule/document.rs`, `technicals-wasm/src/rule/version.rs`
