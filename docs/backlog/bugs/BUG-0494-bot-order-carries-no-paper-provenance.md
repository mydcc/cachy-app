---
id: BUG-0494
title: A bot's order carries no paper provenance, so the paper switch is read twice and can flip in between
type: bug
status: done
priority: P1
assignee: opencode
branch: fix/BUG-0494-bot-paper-provenance
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: ADR-0012
depends_on: []
---

# BUG-0494 — A bot's order carries no paper provenance

## Symptom

FEAT-0396's scope is explicit: a bot proposes an order **into paper**, and live
sending is FEAT-0035. Nothing on the order itself says so. The guarantee rests
entirely on a check that runs earlier than the decision it is supposed to
govern, against a value that can change in between.

If `paperState.enabled` flips from `true` to `false` between a bot's check and
the transport's own read, the bot's order is sent to the **real venue with real
money** — an order the trader never clicked, sized by a strategy the product
does not yet claim can trade live.

## Evidence

**Derived, from reading the code.** The switch is read twice, by two modules,
with an `await` and a dynamic import between the reads.

Read 1 — `src/services/alertEngine/botOrders.ts`, inside `submitBotOrder`:

```typescript
if (!env.paperEnabled()) return "paper-trading-off";
```

wired in `src/stores/alerts.svelte.ts:208` as
`paperEnabled: () => paperState.enabled`.

Between the reads — `src/stores/alerts.svelte.ts`, the `place` port:

```typescript
place: async (plan) => {
    const { orderPlacementService } = await import("../services/orderPlacementService");
    return orderPlacementService.placeEntryGroup(plan);
},
```

The dynamic import is deliberate and documented ("Imported at the moment an
order is actually placed, not at startup"). On a session's **first** bot firing
this is a real chunk fetch, not a microtask — the window is network-shaped, not
nanosecond-shaped.

Read 2 — `src/services/tradeService.ts:351` and again at `:593`:

```typescript
if (paperState.enabled) {
    return (await paperExchange.handle(endpoint, payload)) as T;
}
```

`EntryPlan` carries `exchange`, `symbol`, `tradeType`, `entryType`, `qty`,
`entryPrice`, `stopLossPrice`, `takeProfits`, `accountSize`, `riskPercentage` —
and no field naming where the order came from. `tradeService` therefore cannot
tell a bot's order from a human click, and could not honour "this one is paper
only" even if it wanted to.

This is the same shape already recorded for the reduce flag: `EntryPlan` cannot
express a constraint the caller depends on, and the protection is an accident
of two unrelated rules lining up rather than a guard.

## Cause

"Paper only" was implemented as a **precondition at the call site** rather than
as a **property of the order**. A precondition is only as strong as the
distance to the decision it guards; here that distance is an `await` plus a
module fetch, and the guarded decision re-reads mutable global state.

`botOrders.ts` states the intent correctly — "A bot submits only when the trader
armed it *and* paper trading is on" — but expresses it where it cannot hold.

## Fix

Make paper-ness travel with the order instead of being re-derived:

1. Add an explicit provenance field to `EntryPlan` (e.g.
   `origin: "manual" | "bot"`, or the narrower `paperOnly: true`).
2. In `tradeService.signedRequest` (`tradeService.ts:351`, `:593`), refuse —
   loudly, not silently — a `paperOnly` payload when `paperState.enabled` is
   false, instead of falling through to the live branch. A refused bot order
   the trader can see is strictly better than a live order they did not ask for.
3. Keep the early `paperEnabled()` check in `submitBotOrder`. It is the right
   place to produce the `"paper-trading-off"` refusal the Automation tab shows;
   it just must not be the only thing standing between a bot and a venue.

Hoist the dynamic import out of the hot path only if measurement says it
matters — shrinking the window is not the fix, closing it is.

## Acceptance criteria

- [ ] A test flips `paperState.enabled` to `false` after `submitBotOrder`'s
      check but before the transport reads it, and asserts **no live request**
      is issued
- [ ] The test fails without the fix
- [ ] A manual (`origin: "manual"`) order is unaffected with paper off
- [ ] The refusal is surfaced to the trader, not only logged
- [ ] `EntryPlan`'s new field is required, not optional-with-default, so a new
      call site cannot omit it and silently get the live path

## Links

- `docs/adr/0012-*` — decision 5, one gate for every automated order
- `docs/backlog/features/FEAT-0396-*` — scope stops at paper
- `docs/backlog/features/FEAT-0035-*` — the item that would build live sending
- BUG-0491 — the other way a bot reaches the venue more often than intended
- FEAT-0488 — the submission guard this sits beside
