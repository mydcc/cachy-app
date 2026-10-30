---
id: FEAT-0748
title: Per-alert delivery channels and test announcement
type: feature
status: done
assignee: opencode
branch: feature/feat-0748-per-alert-channels
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
2. **External channels per rule.** The FEAT-0623 audit decided that per-rule
   external selection is wanted. Extend `TriggerMethod` on both sides
   (`technicals-wasm/src/rule/lifecycle.rs` and `src/lib/rules/types.ts`) with
   `email | discord | telegram`, and amend ADR-0018 before the first variant
   ships. The policy stays the ceiling: a rule may select a channel the trader
   configured, never open one they have not. The field is hash-excluded, so no
   migration of journal linkage is owed; the schema version and the read path
   still need the same care every core change gets.
3. **Test announcement.** A "Send test" action on the lifecycle footer and on
   the control center's rule row. It goes through the same delivery service,
   is labelled as a test in the message, and must not touch rule state: no
   `fired_count`, no anchor, no `enabled` flip, no journal entry.
4. **Show the effective set.** The builder's footer, the list row and the
   control center name the channels a rule will actually use: the local ones the
   rule selected (or the policy's, when it selected none), plus the external
   ones the policy enables. The existing hint stays; the concrete set is added
   beside it.
5. A channel that is not configured is not offered and cannot be selected — no
   switch that silently delivers nothing. External channels remain opt-in, and
   their credentials stay in Settings (ADR-0018).

## Acceptance criteria

- [x] `TriggerMethod` accepts `email | discord | telegram` on both sides, and a
      rule selecting one delivers only when the policy also wants it and the
      channel is configured and active; ADR-0018 is amended in the same PR.
      *Done:* the Rust enum and `src/lib/rules/types.ts` carry all six, WASM
      rebuilt; `channelSelection` + `effectiveChannels` narrow, and
      `notificationService` intersects with `wants` and `isActive`; ADR-0018
      gained amendment and decision 6.
- [x] The BUG-0750 boundary tests still pass unchanged for the local three
      channels. *Done:* `alerts_firingSink.test.ts` unchanged and green; only
      the `dispatchExternal` spy expectation gained the new `test` argument.
- [x] The external-channel question is resolved by the FEAT-0623 audit and the
      resolution is visible in both the rule and the UI: either the three
      channels are selectable per rule, or the UI states that they are global.
      *Done:* selectable per rule; the footer offers an external channel only
      while it is configured and switched on.
- [x] "Send test" reaches exactly the channels the rule would use, is labelled
      as a test, and leaves `fired_count`, `last_fired_anchor_ms` and
      `enabled` unchanged — pinned by a test.
      *Done:* `src/stores/alertDelivery.ts` sends with `exactChannels: true` and
      `test: true`; `alertDelivery.test.ts` pins both the label and the
      untouched state; the row's button is wired through `ManageTab`.
- [x] Unconfigured channels are absent from the selector, not present and
      inert. *Done:* `externalMethods` filters on `externalChannelsStore.isActive`;
      a paused channel disappears with it.
- [x] When no local channel is ticked, the builder's footer names the effective
      channels — the policy's local ones plus any external channel the policy
      enables — and keeps the existing hint. If the policy enables none, it says
      so. *Done:* the `.effective` line reads "Goes to …" or "No channel is
      active"; the hint is untouched.
- [x] The effective channel set is readable on the list row in both locales.
      *Done:* `.row-channels` in `AlertRow.svelte`, English and German keys.
- [x] Every new control is keyboard reachable and labelled. *Done:* the footer
      and row test buttons are native `<button>`s with `aria-label`/`title`; the
      selector stays a fieldset of checkboxes.

## Decisions

- **The test send is exact.** `notify()` gained `exactChannels` for it, so an
  empty resolved set means "nothing", not "fall back to the policy". Without
  that flag a test would prove a channel the rule never uses.
- **A stable event id per rule** (`test:<ruleId>`) reuses the service's
  duplicate window as the rate limit the open question proposed.
- **Unknown methods are dropped, not shown.** After FEAT-0748 the row names the
  *effective* set, so a hand-edited `carrier_pigeon` would otherwise read as a
  channel; it is skipped and the policy's set is shown.

## Out of scope

- New channel types, delivery retries, or server-side delivery.
- Per-type sound selection (which sound an `alert-fired` uses) unless
  FEAT-0623 explicitly asks for it.
- Making external delivery the default. It stays opt-in, per ADR-0018.
- Notification history; the firing log is FEAT-0747.

## Open questions

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
