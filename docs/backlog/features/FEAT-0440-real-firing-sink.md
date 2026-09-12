---
id: FEAT-0440
title: Replace the shadow sink with one that announces, counts and retires
type: feature
status: done
priority: P1
assignee: mydcc
resolved_at: 2026-09-11
branch: worktree-super-alert-firing-sink-11441b
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0387, FEAT-0393]
size: M
estimate: 5
---

# FEAT-0440 — Replace the shadow sink with one that announces, counts and retires

## Problem

FEAT-0393 shipped four lifecycle fields — trigger method, frequency, validity
period, note — and the core reads all four correctly. Nothing on the client
does. The builder's footer writes them, the content hash correctly ignores
them, and then they reach a sink that was built for shadow mode.

Three consequences, in the order a trader meets them:

- **Frequency is a dead field.** `notifyingRuleSink` called `disarmRule`
  unconditionally, so a rule set to `every time` went quiet after its first
  touch. The trader picked the setting, the footer remembered it, and the
  behaviour was `once` regardless.
- **The note never arrives.** It is the field that answers "why did I arm
  this" two weeks later, and it appeared nowhere in the announcement.
- **An expired rule reads as a fired one.** Manage's history list badges every
  row "fired". A setup that lapsed untriggered is not a setup that paid off,
  and a trader deciding whether a level held cannot be told the wrong one.

Behind all three: `EvaluationContext.state` was never populated, so
`evaluate_with_lifecycle` saw every rule as never-fired. Fire state has no
owner on the client.

## Proposal

Give fire state an owner, next to the thing that produces it.

- `ruleStateStore.ts` — `RuleState` per rule id in `cachy_rule_state_v1`,
  Class A. Not a field on `RuleDocument`: the document is the strategy, and an
  alarm going off must not move its content hash.
- `RuleEvaluationLoopOptions.readRuleState` — injected like every other reader,
  so the loop stays callable without storage. `ruleLoopWiring` supplies the real
  one; an absent reader keeps the pre-FEAT-0393 behaviour.
- `notifyingRuleSink` — announce, count, record, and retire **only** when the
  frequency is spent.
- `alert-fired` notification category, so alerts route through
  `notificationService` rather than calling the toast service directly.
- `ruleLifecycleView.ts` — joins legacy alert ids to their rules so Manage can
  say "expired" where it currently says nothing or "fired".

## Acceptance criteria

- [x] A rule with `frequency: once` (or none) is disarmed after announcing
- [x] A rule with `every_time` or `once_per_candle_close` stays armed
- [x] `fired_count` and `last_fired_anchor_ms` are persisted and reach the core
      as `EvaluationContext.state`
- [x] The note appears in the announcement — FEAT-0393 AC 6
- [x] Manage shows an expired rule as expired, not as fired — FEAT-0393 AC 2
- [x] A rule that fired *and then* expired still reads as fired
- [x] Corrupt or absent fire state reads as never-fired, never as spent
- [x] German and English strings

## Resolved while building (2026-09-11)

- **The browser channel stays off by default.** `alert-fired` was first written
  as `{ in-app: true, browser: true }`, which failed the pinned invariant
  `leaves every browser channel off until asked`. The invariant is right: the
  channel needs OS permission, and a settings screen that shows it live while it
  silently is not is worse than one channel fewer. FEAT-0397 turns it on next to
  the permission prompt.

- **The announcement is keyed per candle, not per rule.** `DUPLICATE_WINDOW_MS`
  is 60s — exactly one 1m candle. A per-rule key would have let infrastructure
  the trader never configured swallow every second announcement of an
  `every_time` rule, which is the "silently muted alarm" failure wearing a new
  hat. `alertNotificationKey(ruleId, anchorMs)`.

- **An expired rule is deliberately not disarmed.** Disarming drops it into the
  history list, where every row reads "fired". It stays armed-and-badged
  instead, which also leaves the trader able to extend its validity period.

- **`ruleLifecycleView` reads storage directly** rather than through
  `ruleLoopWiring.readStoredRules`. The readers are identical, but that module
  is the market store's neighbour and drags `marketState`, the toast service and
  the mark-candle cache into the panel's import graph — which `alerts.svelte.ts`
  code-splits away for exactly that reason.

## Still open

- **`every_time` cannot beat the per-anchor gate.** `ruleEvaluationGate` allows
  one evaluation per rule per closed candle (FEAT-0387), so under close-driven
  evaluation `every_time` and `once_per_candle_close` behave identically. That
  is a consequence of the cutover, not of this item, but the builder's footer
  offers the trader a distinction the engine cannot currently honour. Needs its
  own item, or a footer that says so.
- **`trigger_methods` is still unread.** Which channels a rule announces on is
  [`FEAT-0397`](FEAT-0397-notification-channels.md); this ships the category the
  policy hangs off.
- **State is pruned only on demand.** `pruneRuleStates` exists and nothing calls
  it yet; a natural home is the same startup path that reconciles orphaned rules.

## Links

- [`FEAT-0393`](FEAT-0393-rule-trigger-method-and-lifecycle.md) — the fields, and
  the two ACs this item carries
- [`FEAT-0392`](FEAT-0392-notification-sound-channel.md) — sound channel, unblocked by this
- [`FEAT-0397`](FEAT-0397-notification-channels.md) — channel configuration, unblocked by this
