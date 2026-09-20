---
id: BUG-0522
title: Protection check cannot tell hedge sides apart because venue plans carry no usable side
type: bug
status: done
assignee: opencode
branch: fix/bug-0522-hedge-position-scoping
shipped: unreleased
priority: P0
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# BUG-0522 — Protection check cannot tell hedge sides apart because venue plans carry no usable side

Residual of BUG-0502 (Paket B depth review).

## Symptom

In hedge mode, a stop belonging to the opposite side's position can settle the
protection check: the entry reports "attached" while its own stop is missing.
The position exists unprotected and the UI says otherwise — the exact failure
BUG-0502 closed for the stale-plan and wrong-price cases.

## Evidence

**Derived**, from reading the code against the venue pipeline:

- `matchesIntent` in `src/services/orderPlacementService.ts` excludes a plan
  via `sideCompatible` — which answers `true` for anything it does not
  recognise, and production plans are always unrecognised: `normalizeTpSlRow`
  (`src/services/tpslNormalize.ts`) never sets `side`, and `updateFromWs` /
  `plansFor` (`src/stores/tpsl.svelte.ts`) never read it either.
- The BUG-0502 acceptance test constructs `side: "SELL"` by hand, so the
  hedge case is green in tests and dead in production.

## Cause

The check needs a discriminator the venue actually provides. `side` is not
one (its semantics — order side vs. position side — are unconfirmed, so mapping
it risks inverting the check). `positionId` is: documented on REST rows and WS
pushes (`docs/bitunix-api/06_tp_sl.md`, `08_websocket.md` §`tp_sl`), already
mapped on the REST path, opposite hedge sides have different ids.

Additionally `confirmProtection` reads through `plansFor`, which returns only
the first plan per leg type — in hedge mode with stops on both sides it sees
an arbitrary one.

## Fix

- Map `positionId` from WS pushes onto legs (`RawWsTpSl`, `updateFromWs`).
  Deliberately no `side` mapping.
- Match over the full plan list for the symbol (new accessor alongside
  `plansFor`), requiring the entry's `positionId` (via the existing
  `resolvePositionId`, resolved concurrently with the first plan read).
- Fail-open fallback: when `positionId` is absent on either side, today's
  price-plus-identity behaviour applies unchanged — a missing id must never
  turn every confirmation into "unprotected".

## Acceptance criteria

- [ ] A test reproduces the defect (opposite-side same-price plan settles the
      check) and fails without the fix
- [ ] The test passes with the fix; same-position new plan still confirms
- [ ] Missing `positionId` falls back to today's behaviour (pinned by test)
- [ ] One-way adds are unaffected (shared position id, before-image applies)
- [ ] `plansFor` card behaviour unchanged

## Out of scope

- Mapping venue `side` (semantics unconfirmed — see Cause)
- Cold-cache before-image residual (accepted in BUG-0502)

## Links

- [`BUG-0502`](../bugs/BUG-0502-protection-check-matches-any-stop-on-the-symbol.md) — parent fix
- `src/services/orderPlacementService.ts` — `matchesIntent`, `confirmProtection`
- `src/stores/tpsl.svelte.ts` — `updateFromWs`, `plansFor`
