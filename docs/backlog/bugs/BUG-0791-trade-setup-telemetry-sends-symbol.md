---
id: BUG-0791
title: The trade-setup panel reports which trading pair a fetch or suggestion targeted
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: C
adr: ADR-0001
depends_on: []
assignee: opencode
branch: fix/telemetry-symbol-leak
---

# BUG-0791 — TradeSetupInputs sends the symbol to Matomo (W1-10)

## Symptom

Three custom events in the setup panel carried the selected trading pair as the
event name:

- `trackCustomEvent("Symbol", "SelectSuggestion", s)` — accepting a suggestion
- `trackCustomEvent("Price", "Fetch", symbol)` — refreshing a price
- `trackCustomEvent("ATR", "Fetch", symbol)` — fetching the ATR value

AGENTS.md names this explicitly under Class C: public market data may live
anywhere, but "never next to a user identity. What symbols someone watches is
user data." The structure audit (W1-10) found the first call site; the other
two carry the same value and were missed.

## Evidence

The same file already documents the rule for a different field: `app.ts`
dropped the "currently viewed pair" from the default telemetry dimensions in
BUG-0286 and is guarded by a test. Here no guard existed, so the value came
back. `trackCustomEvent` (`src/services/trackingService.ts:176-196`) puts a
truthy third argument into `custom-event-name`, which reaches Matomo.

## Cause

The call sites were written as "category, action, and what it was about", with
the pair as the third argument. Nothing mechanical objected: the tracking
service accepts an optional `name`, and no test watched this component.

## Fix

Drop the third argument at all three sites. The event itself stays — *that* a
price or ATR fetch happened is usage data, *which* pair it fetched for is not.

Two guards keep it that way:

- `TradeSetupInputs.telemetry.test.ts` parses the component and fails on any
  `trackCustomEvent` call with more than two arguments whose `(category,
  action)` is not on a documented allowlist (`ATR|Toggle`,
  `ATR|ChangeTimeframe`). Structural, so an aliased variable, a template
  literal or a joined string is caught; a regex over raw text would not be.
- `TradeSetupInputs.component.test.ts` asserts the three events end to end
  (`toHaveBeenCalledWith("Price", "Fetch")` — an exact-arguments match, so a
  restored third argument fails), which also proves each handler still fires.

## Acceptance criteria

- [x] No `trackCustomEvent` call in `TradeSetupInputs.svelte` passes the pair
      as a name — enforced structurally, with a self-check that the rule flags
      a sample carrying one
- [x] The five events the panel owns are still reported, and the three touched
      handlers are covered end to end
- [x] The guards fail against the unfixed file — verified by replaying each
      against `origin/develop`'s version of the component

## Out of scope

- **`MarketOverview.svelte` and `GlobalTracker.svelte` still send the pair**,
  on five `data-track-context={JSON.stringify({ symbol })}` attributes and
  five direct `trackInteraction(..., { symbol })` calls
  (`MarketOverview.svelte:509,540,544,561,564,590,593,880,883`). W1-10/B12
  names them alongside this panel; they need their own change and tests.
  Tracked in BUG-0794.
- `trackCustomEvent("ATR", "Toggle", "On" | "Off")` and
  `("ATR", "ChangeTimeframe", val)` keep their third argument: neither value
  identifies a user, and both are allowlisted explicitly.

## Links

- `src/components/inputs/TradeSetupInputs.svelte`
- `src/components/inputs/TradeSetupInputs.telemetry.test.ts`
- `src/components/inputs/TradeSetupInputs.component.test.ts`
- `src/services/trackingService.ts`
- `docs/backlog/bugs/BUG-0794-market-overview-sends-symbol.md`
- ADR-0001 — Local-First boundary; AGENTS.md Class C
