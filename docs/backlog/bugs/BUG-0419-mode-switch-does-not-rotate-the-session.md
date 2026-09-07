---
id: BUG-0419
title: A read started before a mode switch can still land after it
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [BUG-0418]
---

# BUG-0419 — A read started before a mode switch can still land after it

## Symptom

A `/api/account` or `/api/leverage-margin-mode` read issued in live mode, still
in flight when the trader switches to paper, is applied on arrival. For the few
hundred milliseconds the request is outstanding, a live value can be written
into a paper session — and the reverse on the way back.

BUG-0418 clears the state held at the moment of the switch. This is the state
that arrives *after* it.

## Evidence

**Derived.** No reproduction yet; a test would need to hold a response open
across the switch, the way `PositionsSidebar.race.component.test.ts` does for
BUG-0412.

The ordering guard should catch this and does not. `accountReadOrder.mayApply()`
refuses a ticket whose session is no longer current — but a mode switch does
not rotate the session:

- `src/services/accountSession.svelte.ts:121` — `reset()` calls `rotate(reason)`
  first, so a real account switch invalidates every in-flight ticket.
- `src/services/paperTradingService.ts:204` — `setEnabled()` never rotates, so
  tickets issued before the switch stay valid across it.

## Cause

The session epoch answers "which account is this read for". A mode switch
changes the answer — a simulated account is not the live one — but does not
advance the epoch, so the guard waves the read through.

## Fix

Rotate the session on a mode switch, so in-flight reads are refused exactly as
they are on an account switch.

**Why this is not folded into BUG-0418:** `accountSession.svelte.ts:49` imports
`paperTradingService` statically, so calling `accountSession` from
`paperTradingService.setEnabled()` closes an import cycle. The options, none of
which belong in a fix that also touches order pricing:

1. Split the epoch (`rotate`/`current`/`isCurrent`, no dependencies) out of the
   clearing orchestration (`reset`, which reaches four stores and the paper
   service). The epoch module is then importable from anywhere. Cleanest, and
   touches every caller of `accountSession.reset()`.
2. Register a mode-switch hook, the way `accountState.registerSyncCallback`
   already works in this codebase. Smaller, adds indirection.
3. Accept the cycle, relying on both modules only using each other at runtime.
   Works in ES modules, fragile, and a reviewer will rightly flag it.

Option 1 is the honest one; it is a refactor and wants its own PR and its own
regression run.

## Acceptance criteria

- [ ] A test holds an account read open across a mode switch and asserts the
      response is discarded
- [ ] The same for `/api/leverage-margin-mode`
- [ ] No import cycle is introduced
- [ ] Every existing `accountSession.reset()` caller still behaves identically

## Links

- [BUG-0418](BUG-0418-mode-switch-keeps-remote-account-state.md) — clears the state held at the switch; this one is the state arriving after
- [BUG-0412](BUG-0412-duplicate-sidebar-account-fetch-race.md) — introduced the ordering ticket and the session check
