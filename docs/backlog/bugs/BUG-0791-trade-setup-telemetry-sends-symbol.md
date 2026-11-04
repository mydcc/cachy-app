---
id: BUG-0791
title: The trade-setup panel reports which trading pair a fetch or suggestion targeted
type: bug
status: in-progress
priority: P3
milestone: none
editions: [community, pro, private]
area: security
data_class: C
adr: none
depends_on: []
assignee: opencode
branch: fix/telemetry-symbol-leak
---

# BUG-0791 — TradeSetupInputs sends the symbol to Matomo (W1-10)

## Symptom

Three custom events in the setup panel carry the selected trading pair as the
event name:

- `trackCustomEvent("Symbol", "SelectSuggestion", s)` — accepting a suggestion
- `trackCustomEvent("Price", "Fetch", symbol)` — refreshing a price
- `trackCustomEvent("ATR", "Fetch", symbol)` — fetching the ATR value

AGENTS.md names this explicitly under Class C: public market data may live
anywhere, but "never next to a user identity. What symbols someone watches is
user data." The structure audit (W1-10) found the first call site; the other
two carry the same value and were missed.

## Evidence

The same file already documents the rule two lines above the fix point for a
different field: `app.ts` dropped the "currently viewed pair" from the default
telemetry dimensions in BUG-0286 and is guarded by a test. Here no guard
existed, so the value came back.

## Cause

The event call sites were written as "category, action, and what it was about",
with the pair as the third argument. Nothing mechanical objected: the tracking
service accepts an optional `name`, and no test watched this component.

## Fix

Drop the third argument at all three sites. The event itself stays — *that* a
price or ATR fetch happened is usage data, *which* pair it fetched for is not.

## Acceptance criteria

- [ ] No `trackCustomEvent` call in `TradeSetupInputs.svelte` passes the pair
      as a name
- [ ] The three events still fire (a test fails if they are deleted outright)
- [ ] The guard fails against the unfixed file — verified by stashing the fix
      and re-running it

## Out of scope

- Other telemetry call sites in the repo: the audit checked `app.ts`
  (BUG-0778) and this panel. A repo-wide audit of `trackCustomEvent` callers
  is not part of this item.
- `trackCustomEvent("ATR", "Toggle", "On" | "Off")` and
  `("ATR", "ChangeTimeframe", val)` stay: neither value identifies a user.

## Links

- `src/components/inputs/TradeSetupInputs.svelte`
- `src/components/inputs/TradeSetupInputs.telemetry.test.ts`
- `src/services/trackingService.ts`
- AGENTS.md — Class C, "what symbols someone watches is user data"
