---
id: FEAT-0393
title: Trigger method, frequency, validity period and note per rule
type: feature
status: specced
priority: P2
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

- [ ] Frequency `once` disarms after firing; `every time` stays armed; `once per candle
      close` fires at most once per closed trigger candle
- [ ] A rule past its validity period expires and does **not** fire, and Manage shows it
      as expired rather than as fired
- [ ] Two rules differing only in frequency, validity or note have the **same** content hash
- [ ] Two rules differing in symbol, timeframe, conditions or consequence level have
      **different** content hashes
- [ ] A document written at the previous schema version migrates and keeps its hash
- [ ] The note appears in the announcement on every channel that can carry text
- [ ] German and English strings

## Out of scope

- Snooze and per-rule cooldown. Related, but a separate decision.

## Open questions

- **Does "once per candle close" mean the trigger timeframe's candle?** It should, but
  say so explicitly — a rule reading three timeframes has three candidate answers.

- [`FEAT-0397`](FEAT-0397-notification-channels.md) — notification channel configuration
## Links

- [`FEAT-0392`](FEAT-0392-notification-sound-channel.md) — the channels a trigger method picks from
- [`FEAT-0389`](FEAT-0389-super-alert-panel.md) — the footer these fields live in
- `technicals-wasm/src/rule/document.rs`, `technicals-wasm/src/rule/version.rs`
