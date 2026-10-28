---
id: BUG-0750
title: Per-alert trigger methods never reach delivery
type: bug
status: specced
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
sound — under the label "on which channels" a rule announces itself. The choice
is written into `draft.trigger_methods`, persisted by `armRule`, and
documented as hash-excluded. It has no effect on what happens when the rule
fires: delivery is decided by the global category policy alone.

`docs/alert-system.md` states the opposite — "The trigger method chosen on the
rule selects which channels announce it" — so the documentation, the UI label
and the code disagree.

## Evidence

**Demonstrated by reading the code, not yet reproduced at runtime.**

- `src/components/alerts/RuleLifecycleFields.svelte:80-87` writes
  `draft.trigger_methods`; the footer summarises them as the channels a rule
  uses (`:117-121`).
- `src/services/alertEngine/armRule.ts:98-110` persists the field and strips it
  only for the strategy comparison, so it is stored but hash-excluded.
- `src/stores/alerts.svelte.ts:389-400` — `notifyingRuleSink` calls
  `notificationService.notify({ category: "alert-fired", eventId, message,
  tone })`. The rule's `trigger_methods` is not passed.
- `src/services/notificationService.svelte.ts:48-56` — `NotificationRequest`
  has `category`, `eventId`, `message`, `tone`; no channel field.
- `src/services/notificationService.svelte.ts:108-156` — `notify()` resolves
  every channel from `notificationPolicyStore.wants(category, …)`, the global
  policy, and never reads the rule.
- A search for `trigger_methods` across `src/services`, `src/stores` and
  `src/lib/notifications` finds only the builder, the type, the arm path's
  strategy comparison, the blank draft and a template test. Nothing on the
  delivery path reads it.

Consequence: a rule whose lifecycle says "in-app only" still rings the sound
channel and still opens a browser notification when the global policy has them
on. A rule that selects only "sound" still shows a toast. The per-alert control
is a promise the app does not keep.

## Proposal

Pass the rule into the delivery decision and let the rule's list **narrow** the
global policy:

- A channel is delivered only if the policy wants it **and** the rule selects
  it. The global policy stays the safety ceiling; an alert may never widen it.
- An absent or empty `trigger_methods` keeps today's behaviour exactly — the
  policy default — as `types.ts` documents for every rule authored before the
  field existed.
- The intersection belongs in one place (`notificationService` or a small pure
  resolver beside `notificationPolicy.ts`) so the in-app, browser and sound
  paths cannot diverge.

External channels (`email`, `discord`, `telegram`) are policy-global and not
expressible in `TriggerMethod` today. Whether they become per-rule is
[`FEAT-0748`](../features/FEAT-0748-per-alert-delivery-channels-and-test-announcement.md)'s
decision, not this bug's.

## Acceptance criteria

- [ ] A rule with `trigger_methods: ["in_app"]` delivers no browser and no sound
      announcement even when the global policy enables both — proven by a test
      at the `notifyingRuleSink`/`notificationService` boundary, not by a
      comment.
- [ ] A rule with absent or empty `trigger_methods` behaves exactly as today,
      pinned by a test so the default cannot drift.
- [ ] A rule selecting a channel the policy has disabled delivers nothing on
      it. The intersection is asserted in both directions.
- [ ] The content hash does not change when `trigger_methods` changes (the
      field stays hash-excluded), pinned by a test.
- [ ] `docs/alert-system.md` matches the implemented behaviour afterwards.

## Out of scope

- Building the per-alert selector — it already exists in
  `RuleLifecycleFields.svelte`.
- Per-rule external channels and the test announcement — FEAT-0748.
- Per-type sound selection.

## Open questions

- Should a rule that selects a channel the policy forbids show a hint in the
  builder? Proposal: yes, but as a follow-up in FEAT-0748's UI work; the bug fix
  is the delivery behaviour.

## Links

- `src/stores/alerts.svelte.ts` — `notifyingRuleSink`
- `src/services/notificationService.svelte.ts` — `notify`, `NotificationRequest`
- `src/lib/notificationPolicy.ts` — the global policy
- `src/components/alerts/RuleLifecycleFields.svelte` — the per-rule selector
- `src/services/alertEngine/armRule.ts` — persistence and hash exclusion
- [`docs/alert-system.md`](../../alert-system.md) — the claim that is false today
- [`FEAT-0748`](../features/FEAT-0748-per-alert-delivery-channels-and-test-announcement.md)
