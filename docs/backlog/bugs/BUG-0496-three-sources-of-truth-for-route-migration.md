---
id: BUG-0496
title: Three separate lists answer whether a route is cut over, and nothing makes them agree
type: bug
status: ready
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: ADR-0013
depends_on: [FEAT-0405]
---

# BUG-0496 — Three sources of truth for route migration

## Symptom

"Is this route cut over to client-side signing?" has three answers in the
codebase and they do not match. The safe divergence is loud; the dangerous one
is silent, which is the wrong way round.

## Evidence

**Derived, from reading the code.** Three lists, three counts:

| Source | Says | Count |
|---|---|---|
| `ROUTE_SIGNING_PLAN` (`restSigningPlan.ts:78-115`) | how a route signs | 12 |
| `ENVELOPE_SIGNED_ROUTES` (`tradeService.ts:96`) | whether the client signs | 1 |
| Handlers calling `checkPresignedRequest` | whether the server verifies | 11 |

`/api/orders` is in the first and absent from the third (BUG-0495). Only
`/api/tpsl` is in all three.

The asymmetry is what makes this worth filing. `assertPresignedConsistency`
(`presignedEnvelope.ts`) opens with:

```typescript
const plan = planForRoute(input.cachyPath);
if (!plan) return;
```

- **Guard without plan** → the guard returns quietly, the route forwards
  unchecked. Silent.
- **Plan without guard** → the route takes a secret it should not. Silent.
  (This is `/api/orders` today.)
- **Guard without client** → `400 PRESIGNED_ENVELOPE_MISSING`. Loud, caught in
  the first manual test.

So the two failure modes that weaken the cutover produce no signal at all, while
the one that merely breaks a feature is immediately visible. A reviewer adding a
route sees the loud one and concludes the mechanism protects them.

The comments are explicit that plan membership is meant to *mean* something —
`presignedEnvelope.ts`: "A route absent from the table has not been cut over […]
unmigrated routes are still free to carry a secret until their own PR removes
it." That is a security claim resting on a hand-maintained list.

## Cause

The lists were introduced at different times for different jobs — shape,
transport selection, verification — and the overlap between them was never
made structural. Nothing derives one from another, and nothing tests that they
agree, so they drift exactly as far as review attention allows.

## Fix

Make membership derivable rather than repeated. A test is the cheap version, a
type is the durable one.

1. **Now:** a test that asserts the three sets are equal, listing any route in
   one and not the others. This fails today on `/api/orders` and would have
   caught it in review.
2. **Then:** delete `ENVELOPE_SIGNED_ROUTES` (already planned) so the client
   reads `ROUTE_SIGNING_PLAN` alone, and have each migrated handler declare its
   own `MigratedRoute` key so the compiler, not a reviewer, notices a plan row
   without a handler.

This is a mechanism fix: the goal is that a route cannot be half-migrated, not
that reviewers get better at spotting it.

## Acceptance criteria

- [ ] A test enumerates `ROUTE_SIGNING_PLAN` keys and asserts each has a handler
      calling `checkPresignedRequest`
- [ ] The test fails today and names `/api/orders`
- [ ] `ENVELOPE_SIGNED_ROUTES` is gone, or a test pins it equal to the plan keys
- [ ] Adding a plan row without a handler fails the build or a test, not review

## Links

- BUG-0495 — the concrete divergence this generalises
- `docs/adr/0013-*` — the hard-cutover rule the lists are meant to enforce
