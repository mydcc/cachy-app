---
id: FEAT-0025
title: Notify on fills, margin thresholds and connection loss
type: feature
status: specced
priority: P2
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: A
adr: none
depends_on: []
---

# FEAT-0025 — Notify on fills, margin thresholds and connection loss

## Problem

A trader with the tab in the background finds out about a fill, a margin-ratio
climb or a dropped connection when they look. The last one is the worst: a
silently dead WebSocket means the displayed position state is fiction, and
nothing currently says so loudly.

## Proposal

Notifications for order fills and rejections, TP/SL triggers, liquidation
warnings, margin-ratio thresholds, and connection loss or degradation.
Per-category channel selection: in-app, browser notification, and optionally an
external channel the user configures.

**Connection loss is the priority case.** It must be visible in the UI itself,
not only as a notification that may be suppressed — stale data presented as live
is a money bug.

Configuration is Class A. Any external delivery channel is the user's own
endpoint, configured by them, and carries only what they chose to send.

## Acceptance criteria

- [ ] Each category fires on its event, tested against simulated events
- [ ] Connection loss is visible in the UI regardless of notification settings
- [ ] Duplicate notifications are suppressed for one logical event
- [ ] Browser notifications degrade gracefully when permission is denied
- [ ] No Class A data reaches any Cachy-operated endpoint
- [ ] German and English strings

## Links

- `src/services/connectionManager.ts`, `src/services/toastService.svelte.ts`
- [`BUG-0008`](../bugs/BUG-0008-toast-array-unbounded.md) — fix before adding volume
