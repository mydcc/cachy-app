---
id: FEAT-0745
title: "Epic: Alert and Bot Control Center"
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: []
---

# FEAT-0745 — Epic: Alert and Bot Control Center

> **Tracking epic.** The work lives in four sub-items and one prerequisite bug:
> [`FEAT-0746`](FEAT-0746-pause-resume-and-duplicate-armed-rules.md),
> [`FEAT-0747`](FEAT-0747-manage-list-with-search-filters-and-firing-log.md),
> [`FEAT-0748`](FEAT-0748-per-alert-delivery-channels-and-test-announcement.md),
> [`FEAT-0749`](FEAT-0749-control-center-window-for-alerts-and-bots.md) and
> [`BUG-0750`](../bugs/BUG-0750-per-alert-trigger-methods-never-reach-delivery.md).
> This item holds the shared requirements and closes when all five are `done`.

## Delivered

| Item | PR | Result |
| :--- | :--- | :--- |
| FEAT-0746 | #4418 | Pause, resume and duplicate on the manage list |
| FEAT-0747 | #4419 | Full sentences, counts, filters, firing log |
| BUG-0750 | #4394 | A rule's own channel list now reaches delivery |
| FEAT-0748 | #4420 | Per-rule channels and a test announcement |
| FEAT-0749 | #4422, #4423 | The "Alerts & Bots" desk: Alerts, Log, Bots tabs; `AutomationTab` narrowed to the account and the limits |

## Problem

The rule engine can express price, indicator, combination, candlestick and
drawing alerts, and can promote one to a paper bot. The surfaces around it have
not kept up, so a trader with more than a handful of rules has no overview:

- `ManageTab.svelte` shows a symbol and a fragment of a price comparison per
  row, and offers exactly one action: delete. Pausing, editing, duplicating or
  inspecting a rule is impossible from the list.
- There is no search, no filter, no count and no firing log. Past a few rules
  the list stops answering "what is armed, what fired, what is broken?".
- Bots live in Settings → Automation. A trader running alerts and bots has to
  know which surface holds which, and Settings is configuration, not an
  operating desk.
- The per-alert channel choice in the builder is stored but ignored at firing
  time (`BUG-0750`): the one control that promises "this alert stays local"
  currently does not keep that promise.

The engine side is sound and stays untouched: one `RuleDocument`, one
evaluator, `notify < simulate < send` as the authority ladder. See
[`docs/alert-system.md`](../../alert-system.md).

## Proposal

One operating surface, **"Alerts & Bots"**, opened through the entry-point
registry (FEAT-0731/0736), with tabs for alerts, bots and the firing log. It
manages; it does not build. The Super-Alert side panel remains the single
authoring surface, so there is one builder and one rule list in the codebase.

| Item | Title | Scope | Depends on |
| :--- | :--- | :--- | :--- |
| [`FEAT-0746`](FEAT-0746-pause-resume-and-duplicate-armed-rules.md) | Pause, resume and duplicate armed rules | Store-level enable/disable for alerts, duplicate with a fresh id, row actions | — |
| [`FEAT-0747`](FEAT-0747-manage-list-with-search-filters-and-firing-log.md) | Manage list with search, filters and firing log | Full sentence per row, counts, filters, Log tab from the existing ledger | FEAT-0543, FEAT-0746 |
| [`BUG-0750`](../bugs/BUG-0750-per-alert-trigger-methods-never-reach-delivery.md) | Per-alert trigger methods never reach delivery | Honour the rule's channel list at firing time | — |
| [`FEAT-0748`](FEAT-0748-per-alert-delivery-channels-and-test-announcement.md) | Per-alert delivery channels and test announcement | Decide and implement external channels per rule, test send, show the effective set | FEAT-0623, BUG-0750 |
| [`FEAT-0749`](FEAT-0749-control-center-window-for-alerts-and-bots.md) | Control center window for alerts and bots | Registered window, Bots tab, Automation migration | FEAT-0747, FEAT-0748 |

### Prerequisites that already exist or are already queued

| Item | Role |
| :--- | :--- |
| [`FEAT-0542`](FEAT-0542-view-and-edit-armed-alert-from-manage.md) | Edit an armed rule from the list; quick win, independent of this epic |
| [`FEAT-0543`](FEAT-0543-show-full-rule-configuration-on-manage-rows.md) | Full configuration on a row; feeds FEAT-0747 |
| [`FEAT-0623`](FEAT-0623-audit-super-alert-system-gaps-and-design.md) | Audit that answers what announces where; feeds FEAT-0748 |
| [`FEAT-0731`](FEAT-0731-entry-point-registry-data-and-resolver.md) … [`FEAT-0736`](FEAT-0736-guard-the-entry-point-registry.md) | Registry and its guard, both done; the rail entry for FEAT-0749 |
| [`FEAT-0397`](FEAT-0397-notification-channels.md) | External channels, done; delivery lives in `src/lib/notificationPolicy.ts` |

### Delivery order

1. **Quick wins, independent:** FEAT-0542 and FEAT-0543. They heal the worst
   daily pain (delete-and-rebuild) without waiting for the audit.
2. **Operating basics:** FEAT-0746, then FEAT-0747.
3. **Delivery truth:** BUG-0750, then FEAT-0748 once FEAT-0623 has answered the
   external-channel question.
4. **The window:** FEAT-0749, which mounts the list and the bot section.

## Acceptance criteria

- [x] All acceptance criteria in FEAT-0746, FEAT-0747, FEAT-0748, FEAT-0749
      and BUG-0750 are met.
- [x] There is exactly one rule-authoring surface (the Super-Alert panel) and
      one rule-listing implementation (the FEAT-0747 components). The control
      center mounts them; it does not copy them.
- [x] The control center is reachable through the entry-point registry, and the
      registry guard (FEAT-0736) is green with the new entry.
- [x] No new server call and no new Class B feature: rules, their state and
      their firing log stay on the device (ADR-0001). External delivery remains
      opt-in (ADR-0018).
- [x] Every new string exists in both `src/locales/locales/de.json` and
      `src/locales/locales/en.json`.
- [x] The window and every list action are keyboard reachable and labelled for
      assistive technology.

## Out of scope

- `send`-level execution — [`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md).
  The control center stops at `simulate`, exactly like the Automation tab.
- New condition types, backtesting, or changes to the rule schema beyond the
  hash-excluded lifecycle fields.
- Replacing or retiring the Super-Alert panel. It stays the builder.
- Multi-device sync of rules ([`IDEA-0189`](../ideas/IDEA-0189-user-operated-sync.md))
  and the Android companion ([`IDEA-0037`](../ideas/IDEA-0037-android-alert-companion.md)).

## Open questions

- Does the control center eventually absorb the Super-Alert panel, or stay a
  separate window? Proposal: stay separate and measure after ship; a builder
  and an operating desk have different jobs.
- Should the Bots tab be visible in every edition? Proposal: yes. Bots are
  local paper simulations and need no server (ADR-0003).

## Links

- [`docs/alert-system.md`](../../alert-system.md) — one document, three surfaces
- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md) — a strategy is checkable data
- [`ADR-0020`](../../adr/0020-automation-envelope-promotion-and-simulate-bots.md) — promotion, simulate bots, and the gate
- [`ADR-0001`](../../adr/0001-local-first-boundary.md) — Class A
- [`ADR-0018`](../../adr/0018-user-directed-egress-of-class-a-announcements.md) — external channels are opt-in
- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md) — one window authority
- `src/components/alerts/tabs/ManageTab.svelte` — today's list
- `src/services/alertEngine/` — rule store, lifecycle view, firing sink, ledger
- `src/lib/navigation/entry-points.ts` — the registry FEAT-0749 registers into
