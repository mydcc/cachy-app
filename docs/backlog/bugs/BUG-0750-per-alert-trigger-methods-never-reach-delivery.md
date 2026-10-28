---
id: BUG-0750
title: Per-alert trigger methods never reach delivery
type: bug
status: done
assignee: opencode
branch: fix/bug-0750-per-alert-channels
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0018
depends_on: []
size: S
estimate: 3
---

# BUG-0750 — Per-alert trigger methods never reach delivery

## Problem

The Super-Alert builder offers a per-rule channel choice — in-app, browser,
sound — presented as the channels this alarm announces on, and its collapsed
summary repeats that list. The choice is written into `draft.trigger_methods`
and persisted by `armRule`, but it never reached delivery: `notify()` decided
every channel from the global category policy alone.

A trader who ticked "in-app only" still got the OS notification and the tone
whenever the category policy had them on. The control was a promise the app did
not keep — and the settings screen, which does keep its promise, read as the
only place that mattered.

## Evidence

Derived from reading the code, then confirmed by the RED run recorded in
PR #4394 and pinned by the boundary tests in
`src/services/notificationService.test.ts` and
`src/stores/alerts_firingSink.test.ts`.

- `src/components/alerts/RuleLifecycleFields.svelte` writes
  `draft.trigger_methods` and summarises them as the channels a rule uses.
- `src/services/alertEngine/armRule.ts` persists the field and strips it only
  for the strategy comparison, so it is stored but hash-excluded.
- `src/stores/alerts.svelte.ts` → `notifyingRuleSink` called
  `notificationService.notify({ category, eventId, message, tone })`; the
  rule's methods were not passed.
- `src/services/notificationService.svelte.ts` — `NotificationRequest` had no
  channel field, and `notify()` resolved `in-app`, `browser` and `sound` from
  `notificationPolicyStore.wants(category, …)` only.

## Decision

**The rule is authoritative for the three local channels; the policy is the sole
decider for the external ones.**

A non-empty `trigger_methods` decides `in-app`, `browser` and `sound` for that
rule, including switching one on that the category leaves off. The specific
choice on the alert outranks the general category default, and the failure this
subsystem exists to prevent is an alarm that looks armed and is heard by
nobody — a rule ticking "sound" while the category leaves sound off would
otherwise announce only where the category happens to send, by default a toast
the trader who is away from the tab never sees.

`email`, `discord` and `telegram` stay policy-only: the rule can neither add one
nor remove one. They are the only path by which Class A content leaves the
device, so a per-alert switch must not become a way around the egress the trader
configured ([`ADR-0018`](../../adr/0018-user-directed-egress-of-class-a-announcements.md)).

Two deliberate limits, and one safeguard:

- **Absent or empty keeps today's behaviour.** The category policy decides,
  which is what every rule authored before the footer existed means.
- **A category silenced entirely stays silent.** `isSilent` — no channel
  enabled, external included — is checked before the rule's list: the per-rule
  choice does not resurrect a category the trader switched off completely.
- **Availability floor.** If every ticked local channel refuses at the moment
  it fires (permission never granted, a muted tab, an autoplay lock), in-app
  stands in where the category still wants it. A `once` rule is spent after that
  call, so the alternative is an alarm nobody heard. The floor cannot overrule a
  deliberate "no toasts for alerts": it only runs where the policy wants in-app.

## Acceptance criteria

- [x] A rule with `trigger_methods: ["in_app"]` delivers no browser and no
      sound announcement even when the global policy enables both.
- [x] A rule selecting `sound` delivers the tone while the category policy
      leaves sound off — the local-channel half of the decision.
- [x] A rule with absent or empty `trigger_methods` behaves exactly as before,
      pinned by a test so the default cannot drift.
- [x] A category with no channel enabled at all — external included — stays
      silent even when a rule selects one.
- [x] A rule whose only ticked channel refuses at firing time still reaches the
      trader through in-app, and does not when the category has in-app switched
      off; pinned in both directions.
- [x] External channels are neither blocked nor opened by the rule's list: a
      rule selecting only `in-app` still reaches a configured Discord when the
      policy asks for it, and cannot reach one the policy has off.
- [x] The content hash does not change when `trigger_methods` changes (the
      field stays hash-excluded), pinned by the arm-time lifecycle test, which
      also asserts the field is persisted.
- [x] `docs/alert-system.md` describes the implemented behaviour.

## Out of scope

- Building the per-alert selector — it already exists in
  `RuleLifecycleFields.svelte`.
- Per-rule external channels and the test announcement —
  [`FEAT-0748`](../features/FEAT-0748-per-alert-delivery-channels-and-test-announcement.md).
- Per-type sound selection.

## Open questions

- The builder starts with no channel ticked, while the category policy
  announces in-app, so the footer reads "nothing selected" for a rule that does
  announce. That inconsistency is UI, not delivery, and belongs to FEAT-0748's
  "show the effective set" work.

## Links

- `src/stores/alerts.svelte.ts` — `notifyingRuleSink`, `ruleLocalChannels`
- `src/services/notificationService.svelte.ts` — `notify`, `NotificationRequest`
- `src/lib/notificationPolicy.ts` — the global policy and `LocalNotificationChannel`
- `src/components/alerts/RuleLifecycleFields.svelte` — the per-rule selector
- `src/services/alertEngine/armRule.ts` — persistence and hash exclusion
- [`docs/alert-system.md`](../../alert-system.md) — "When a rule fires"
- [`FEAT-0748`](../features/FEAT-0748-per-alert-delivery-channels-and-test-announcement.md)
