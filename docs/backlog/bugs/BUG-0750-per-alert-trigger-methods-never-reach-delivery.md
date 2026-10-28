---
id: BUG-0750
title: Per-alert trigger methods never reach delivery
type: bug
status: done
assignee: opencode
branch: fix/bug-0750-per-alert-channels
shipped: v1.6.0-beta.463 (PR #4394)
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

Demonstrated by reading the code, then pinned by the tests below.

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

**The rule is authoritative for the three local channels; the policy stays the
ceiling for the external ones.**

A non-empty `trigger_methods` decides `in-app`, `browser` and `sound` for that
rule, including switching one on that the category leaves off. The specific
choice on the alert outranks the general category default, and the failure this
subsystem exists to prevent is an alarm that looks armed and is heard by
nobody — a rule ticking "sound" while the category leaves sound off would
otherwise be silent.

`email`, `discord` and `telegram` stay policy-only. They are the one path by
which Class A content leaves the device, and a per-alert switch must not widen
egress the trader disabled for the category ([`ADR-0018`](../../adr/0018-user-directed-egress-of-class-a-announcements.md)).

Two deliberate limits:

- **Absent or empty keeps today's behaviour.** The category policy decides,
  which is what every rule authored before the footer existed means.
- **A category silenced entirely stays silent.** `isSilent` is checked before
  the rule's list: the per-rule choice narrows a category, it does not
  resurrect one the trader switched off completely.

## Acceptance criteria

- [x] A rule with `trigger_methods: ["in_app"]` delivers no browser and no
      sound announcement even when the global policy enables both.
- [x] A rule selecting `sound` delivers the tone while the category policy
      leaves sound off — the local-channel half of the decision.
- [x] A rule with absent or empty `trigger_methods` behaves exactly as before,
      pinned by a test so the default cannot drift.
- [x] A category with every channel switched off stays silent even when a rule
      selects one.
- [x] External channels are neither blocked nor opened by the rule's list: a
      rule selecting only `in-app` still reaches a configured Discord when the
      policy asks for it, and cannot reach one the policy has off.
- [x] The content hash does not change when `trigger_methods` changes (the
      field stays hash-excluded), pinned by the existing arm-time comparison.
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
