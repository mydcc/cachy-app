---
id: FEAT-0623
title: Audit the Super Alert system for gaps and UI/UX design
type: feature
status: done
assignee: opencode
branch: docs/feat-0623-super-alert-audit
priority: P2
milestone: none
created: "2026-10-05"
editions: [community, pro, private]
area: alerts
parent: FEAT-0605
data_class: none
adr: none
depends_on: [FEAT-0607]
---

# FEAT-0623 — Audit the Super Alert system for gaps and UI/UX design

Cachy has a Super-Alert side panel since
[FEAT-0389](FEAT-0389-super-alert-panel.md) (`done`). What it never got is a
review pass over the whole alert experience: which channels exist, which alert
types are configurable, and whether the UI guiding a user through both is
coherent. This item is that pass, as a standalone audit — no implementation.

## Problem

The alert experience is spread over several surfaces that were built
independently: the Super-Alert side panel
(`src/lib/windows/implementations/AlertPanelWindow`), the indicator alert
controls (`IndicatorAlertAction`, `IndicatorCard`, `IndicatorSettings`), the
notification settings (`NotificationSettings`), and the external channels
(`ExternalChannelSettings`). Nobody has checked them against each other.

A mature alert system answers three questions per alert, in one flow: **what**
fires (price, indicator, drawing), **where** it goes (in-app, email, webhook,
messenger), and **how** it announces itself (banner, sound per type). Which of
these Cachy answers, and where the answers live, is currently unknown — that
is the gap this item closes. Reference behaviour is described, not reproduced;
no third-party product names, URLs, or screenshots enter this repository.

## Proposal

Audit the alert system end to end and produce two tables: a gap table (what
the three-question flow needs versus what exists) and a UI/UX findings table
(per surface: what confuses, what is inconsistent, what is missing). Every gap
and every finding is either fixed in a follow-up item linked here or explicitly
deferred with a reason — nothing stays as prose.

This item runs after [FEAT-0607](FEAT-0607-harmonize-settings-vocabulary-placement-and-tabs.md)
so the audit judges the settled vocabulary and placement, not the current
drift.

## Acceptance criteria

- [x] A gap table covers the full flow per alert type (price, indicator,
      drawing): trigger configuration, delivery channels, and announcement
      (banner, sound) — existing versus missing
- [x] A UI/UX findings table covers every alert surface: the side panel, the
      indicator alert controls, the notification settings, and the external
      channels
- [x] Every gap is filed as a follow-up item and linked here, or deferred with
      a recorded reason
- [x] Every UI/UX finding is filed as a follow-up item and linked here, or
      deferred with a recorded reason
- [x] Channel configuration (email, webhook, messenger equivalents) is checked
      for dead ends: a channel that can be configured but never fires, or
      fires but cannot be configured, is a `BUG`, not a finding
- [x] The audit states which alert types support per-type sound or banner
      configuration and which do not

## Result

The audit is
[`assets/FEAT-0623/alert-system-audit.md`](../assets/FEAT-0623/alert-system-audit.md):
two tables (§2 gaps per alert type, §4 findings per surface), a channel
dead-end check (§3), the deferrals with reasons (§5) and the follow-up index
(§7).

It filed five follow-ups and decided the question FEAT-0748 was waiting on. The
dead-end check found one case, which is why it is a bug and not a finding: the
external-channel matrix and delivery disagree about what "switched on" means.

Per-type sound and banner do not exist; the decision to keep them out is
recorded in §5 rather than left as an open question.

## Out of scope

- Implementing anything. This item produces tables and follow-up items, not
  behaviour changes.
- Changing alert evaluation, rule schema, or delivery logic. Those belong to
  the follow-up items.
- Renaming alert vocabulary — that is FEAT-0607's phase 1, which this item
  consumes.
- Third-party interface screenshots or code in this repository. Only our own
  material; reference behaviour is described, not reproduced.

## Open questions

None. What was open — per-type sound and per-rule external channels — is
recorded as a decision in the audit (§5 and §2) and carried by FEAT-0748.

## Links

- Result: [`assets/FEAT-0623/alert-system-audit.md`](../assets/FEAT-0623/alert-system-audit.md)
- Follow-ups filed by the audit: §7 of the result document (the drawing path,
  three list/channel defects, one accessibility item)
- Evidence: [`assets/FEAT-0605/ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §5
- [FEAT-0389](FEAT-0389-super-alert-panel.md) — the side panel this audits
- [FEAT-0395](FEAT-0395-alert-entry-points.md) — chart and indicator entry points
- [FEAT-0605](FEAT-0605-ui-status-quo-audit.md) — parent
- [FEAT-0607](FEAT-0607-harmonize-settings-vocabulary-placement-and-tabs.md) — prereq
