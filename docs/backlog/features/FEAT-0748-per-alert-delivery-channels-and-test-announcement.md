---
id: FEAT-0748
title: Per-alert delivery channels and test announcement
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0018
parent: FEAT-0745
depends_on: [FEAT-0623, BUG-0750]
size: M
estimate: 5
---

# FEAT-0748 — Per-alert delivery channels and test announcement

## Problem

A rule already carries `trigger_methods` (`in_app`, `browser`, `sound`), the
builder's lifecycle footer writes them, and `armRule` persists them as a
hash-excluded field. Until
[`BUG-0750`](../bugs/BUG-0750-per-alert-trigger-methods-never-reach-delivery.md)
they never reached delivery: the firing sink called
`notificationService.notify({ category, eventId, message, tone })`,
`NotificationRequest` had no channel field, and the service resolved channels
from the global category policy alone. That defect is fixed; what remains is the
external half and the missing way to try a channel.

Two gaps remain:

- **External channels cannot be expressed per rule.** `email`, `discord` and
  `telegram` exist in the notification policy and in
  `ExternalChannelSettings.svelte`, but the core's `TriggerMethod` enum has
  only the three local variants. A trader who wants "this alert stays in the
  app, that one goes to Discord" can only choose globally.
- **There is no way to test a channel.** Verifying a webhook means waiting for
  a real market condition, which is the worst possible moment to discover that
  it does not deliver.

## Proposal

1. **Build on BUG-0750, do not repeat it.** That item settled who decides the
   local channels (the rule) and the external ones (the policy), including the
   availability floor when a chosen channel refuses. This item adds the external
   half and the test send; it does not restate the precedence.
2. **External channels per rule, decided by FEAT-0623.** If the audit says
   per-alert external selection is useful, extend `TriggerMethod` on both sides
   (`technicals-wasm/src/rule/lifecycle.rs` and `src/lib/rules/types.ts`) with
   `email | discord | telegram`. The field is hash-excluded, so no migration of
   journal linkage is owed; the schema version and the read path still need the
   same care every core change gets. If the audit says external delivery stays
   global, the UI must say so plainly instead of implying a per-rule choice.
   This item does not pretend to be `ready` before that answer exists.
3. **Test announcement.** A "Send test" action on the lifecycle footer and on
   the control center's rule row. It goes through the same delivery service,
   is labelled as a test in the message, and must not touch rule state: no
   `fired_count`, no anchor, no `enabled` flip, no journal entry.
4. **Show the effective set.** The list row and the control center show which
   channels a rule will actually use (for example "in-app + sound"), so the
   answer is visible without opening the builder.
5. A channel that is not configured is not offered and cannot be selected — no
   switch that silently delivers nothing. External channels remain opt-in, and
   their credentials stay in Settings (ADR-0018).

## Acceptance criteria

- [ ] The BUG-0750 boundary tests still pass unchanged; if FEAT-0623 concludes
      that external channels become selectable per rule, this item records that
      decision and amends ADR-0018 rather than relaxing those tests.
- [ ] The external-channel question is resolved by the FEAT-0623 audit and the
      resolution is visible in both the rule and the UI: either the three
      channels are selectable per rule, or the UI states that they are global.
- [ ] "Send test" reaches exactly the channels the rule would use, is labelled
      as a test, and leaves `fired_count`, `last_fired_anchor_ms` and
      `enabled` unchanged — pinned by a test.
- [ ] Unconfigured channels are absent from the selector, not present and
      inert.
- [ ] The effective channel set is readable on the list row in both locales.
- [ ] Every new control is keyboard reachable and labelled.

## Out of scope

- New channel types, delivery retries, or server-side delivery.
- Per-type sound selection (which sound an `alert-fired` uses) unless
  FEAT-0623 explicitly asks for it.
- Making external delivery the default. It stays opt-in, per ADR-0018.
- Notification history; the firing log is FEAT-0747.

## Open questions

- Per-rule external channels: extend the core enum or keep external delivery
  global? FEAT-0623 answers this; the acceptance criteria are written for
  either answer.
- Should a test announcement be rate-limited? Proposal: yes, one per channel
  per few seconds, reusing the service's duplicate window rather than inventing
  a second throttle.

## Links

- `src/services/notificationService.svelte.ts` — `notify`, `NotificationRequest`
- `src/lib/notificationPolicy.ts` — categories, channels, policy
- `src/lib/notifications/externalChannels.ts` — external delivery
- `src/components/alerts/RuleLifecycleFields.svelte` — the per-rule selector
- `src/lib/rules/types.ts` — `TriggerMethod`, hash-excluded lifecycle fields
- `technicals-wasm/src/rule/lifecycle.rs` — the core enum
- [`BUG-0750`](../bugs/BUG-0750-per-alert-trigger-methods-never-reach-delivery.md)
- [`FEAT-0623`](FEAT-0623-audit-super-alert-system-gaps-and-design.md)
- [`FEAT-0397`](FEAT-0397-notification-channels.md)
- [`ADR-0018`](../../adr/0018-user-directed-egress-of-class-a-announcements.md)
