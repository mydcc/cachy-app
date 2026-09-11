---
id: FEAT-0393
title: Trigger method, frequency, validity period and note per rule
type: feature
status: in-progress
priority: P1
assignee: mydcc
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
      `AlreadyFired`; the Manage surface itself lands with the UI half
- [x] Two rules differing only in frequency, validity or note have the **same** content hash
- [x] Two rules differing in symbol, timeframe, conditions or consequence level have
      **different** content hashes
- [x] A document written at the previous schema version migrates and keeps its hash
- [ ] The note appears in the announcement on every channel that can carry text
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

## Still open

- **The note in the announcement (AC 6) is blocked, not skipped.** There is no
  announcement to put it in: `ruleEvaluationLoop` is still shadow-only — its default
  `FiringSink` is `shadowSink`, which writes a log line and nothing else. No firing rule
  reaches `notificationService` today. The note ships the moment a real sink exists, and
  that sink's owner should carry this AC.

- **Runtime enforcement of frequency and expiry.** The core decides them
  (`evaluate_with_lifecycle`), but the loop never passes a `RuleState`, so nothing tracks
  `fired_count` across evaluations yet. Deliberately left with the sink work: persisting
  fire state belongs next to whatever consumes a firing, not bolted onto a loop that
  currently discards them.

- [`FEAT-0397`](FEAT-0397-notification-channels.md) — notification channel configuration
## Links

- [`FEAT-0392`](FEAT-0392-notification-sound-channel.md) — the channels a trigger method picks from
- [`FEAT-0389`](FEAT-0389-super-alert-panel.md) — the footer these fields live in
- `technicals-wasm/src/rule/document.rs`, `technicals-wasm/src/rule/version.rs`
