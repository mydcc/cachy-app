---
id: BUG-0705
title: An AI addTakeProfit on a full setup overwrites the last target
type: bug
status: done
priority: P2
milestone: none
created: "2026-10-19"
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: [BUG-0704]
assignee: opencode
branch: fix/ai-model-defaults-and-tp-overwrite
---

# BUG-0705 — `addTakeProfit` at the target cap silently rewrites TP4

## Symptom

`app.addTakeProfitRow()` (`src/services/app.ts`) returns early when the setup
already has four targets. `executeAction` (`src/stores/ai.svelte.ts`, case
`addTakeProfit`) calls it and then writes `targets[targets.length - 1]`. With
four targets that index is TP4, so the assistant's "add a target" silently
replaces the user's existing TP4 instead of adding anything.

Nothing in the confirmation block says a target will be overwritten: it renders
`TP Hinzufügen: <price> (<percent>%)`.

## Why it matters

The trade form feeds a position-size calculator that manages real money. A
silently replaced target changes the planned exits, and the confirmation names
an addition, not a replacement.

## Acceptance criteria

- [x] `addTakeProfitRow()` reports whether it added a row (or returns the new
      index) instead of returning `void`.
- [x] `executeAction` writes to the row that was actually added, and does
      nothing — with a visible notice — when the setup is full.
- [x] A test drives the full-setup case and asserts TP4 keeps its value.
- [x] The confirmation text distinguishes "added" from "rejected: 4 targets".

## Out of scope

Changing the four-target cap itself.

## Progress — 2026-10-21

Branch `fix/ai-model-defaults-and-tp-overwrite`. `addTakeProfitRow()` returns
the index it added or `null`; `executeAction` writes to that index and, at the
cap, refuses with a system notice instead of touching TP4. The confirmation
badge says "refused (4 targets reached)" rather than promising an addition.

`ai.takeProfitCap.test.ts` drives both halves: the full setup keeps TP4's
price and percent, a batch of two adds cannot overwrite the row the first one
created, and a setup with a free slot receives the new price. The full-setup
case was RED before the fix (`expected '999' to be '130'`).

Review follow-ups: the cap lives in one constant (`MAX_TAKE_PROFIT_TARGETS`,
`app.ts`), a refused-only batch now renders as `❌ Rejected` instead of
`✅ Confirmed`, and the badge branch has its own case.

## Notes

Found during the security review of PR #4147 (BUG-0704). The context check now
flags the price but not the overwrite; both are independent.
