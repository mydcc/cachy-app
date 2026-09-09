---
id: FEAT-0420
title: Make the stamped account fields writable only through their setter
type: feature
status: done
priority: P2
milestone: none
shipped: 1.6.0-beta.261
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [FEAT-0417]
---

# FEAT-0420 — Make the stamped account fields writable only through their setter

## Problem

`accountState.positionMode` and `positionModeAt` mean something only as a
pair. `setPositionMode()` writes both; a direct assignment writes one and
leaves the other behind, and the mode chip then ages dishonestly (BUG-0409).

FEAT-0417 added a CI scan for the direct form, and stated its own limit: a text
scan cannot see an assignment made through an alias.

```ts
const s = accountState;
s.positionMode = "ONE_WAY"; // stamp untouched, scan blind, nothing fails
```

Nothing in the codebase does this today. The point is that nothing stops it,
and the three bugs in this class all began as something nobody was doing yet.

## Proposal

Make both fields private (`#positionMode`, `#positionModeAt`) with getters.
Reads are unchanged — a getter reads like a field, and Svelte's reactivity
follows it because the getter reads the rune. Writes from outside stop
compiling, and stop working at runtime even when the type is cast away.

**Deliberate exception, recorded rather than implied:** `positionModeVerifying`
and `marginModeVerifying` stay public. They carry no truth value and no stamp —
only "a check is running" — so there is no pair to break, and `tradeService`
sets and clears them around the read-back in a `try/finally` where an extra
setter would be ceremony. FEAT-0417's card asked for this decision to be made
explicitly; this is it.

## Acceptance criteria

- [x] `positionMode` and `positionModeAt` are private with getters
- [x] A test proves a direct assignment throws, including through an alias
- [x] The verifying flags stay public, with the reason written next to them
- [x] Existing readers are untouched — no call site changes to read the values
- [x] Full unit suite, component suite and svelte-check clean

## Links

- [FEAT-0417](FEAT-0417-account-state-write-guard.md) — the CI scan whose blind spot this closes
- [BUG-0409](../bugs/BUG-0409-mode-chip-stale-after-change.md) — why the pair matters
