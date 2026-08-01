---
id: BUG-0001
title: Bitget WebSocket account sync sends field names the account store never reads
type: bug
status: specced
priority: P0
milestone: M0
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
---

# BUG-0001 — Bitget WebSocket account sync sends field names the account store never reads

## Symptom

Bitget account state does not update over WebSocket. A newly opened Bitget
position is never added to `accountState.positions` by the live feed, and if a
position is present by some other path, a second symbol's update overwrites the
first symbol's slot instead of creating its own.

## Evidence

**Derived, not demonstrated.** Both halves follow from reading the two sides of
the call side by side; neither has been confirmed against a live Bitget account.
Full write-up with the quoted field tables: [`../../TODO.md`](../../TODO.md)
item 3.

`accountState.updatePositionFromWs()` and `.updateOrderFromWs()`
(`src/stores/account.svelte.ts`) are shared by the Bitunix and Bitget handlers
and read **Bitunix's** raw field names — `qty`, `positionId`, `orderStatus`,
`dealAmount`, `ctime`. `bitgetWs.ts`'s `handleMessage()` builds a differently
shaped object: `size`, `status`, `filled`, no position id, no create time.

Consequences that follow arithmetically:

- `isClose` is `data.event === "CLOSE" || new Decimal(data.qty || 0).isZero()`.
  Bitget never sends `qty`, so this is `true` on every update and the function
  only ever takes its splice-if-present branch.
- Positions are keyed by `String(data.positionId)`, which is the literal
  `"undefined"` for every Bitget update.

**A second finding in the same function may make the first one moot in
practice.** `handleMessage()` parses everything through
`BitgetWSMessageSchema.safeParse()` first. That schema requires
`action: z.string()`, does not declare `event`/`code`, and is not
`.passthrough()` — so a login acknowledgement shaped `{ event: "login", code:
"00000" }` either fails validation outright or has the fields the login check
needs stripped before it runs. If that reads correctly, `isAuthenticated` never
becomes `true`, `subscribePrivate()` never fires, and the private channels are
never subscribed to at all — meaning Bitget account sync is silently
non-functional rather than merely wrong.

The code's own comment above the check already flags the uncertainty:
*"Assuming action is login for response? ... I might need to adjust schema"*.

## Cause

The missing exchange abstraction. Two parallel WebSocket implementations feed
one shared store that was written against one of them. This is precisely what
[M2](../../MILESTONES.md) exists to remove — but M2 is a milestone away and this
is a `P0` today.

Note the history: `bitgetWs.ts`'s call sites currently carry explicit
`as RawWsOrder` / `as RawWsPosition` casts with comments, added during the
`any` burn-down to *preserve* the buggy behaviour rather than fix it as a
drive-by. Those casts are the marker for where to work.

## Fix

Verify the login path **first** — if authentication never succeeds, fixing the
field names changes nothing observable and the fix cannot be tested end to end.

1. Capture a real Bitget login acknowledgement and a real position/order push.
2. Fix `BitgetWSMessageSchema` (or the check) so the acknowledgement reaches the
   login handler.
3. Then either give Bitget its own update functions, or normalise Bitget's
   payload to the shared shape before calling. Prefer normalisation: it is the
   direction M2 goes anyway, so the work is not thrown away.

Remove the two preserving casts and their comments as part of the fix — they
exist only to mark this bug.

## Acceptance criteria

- [ ] A test replays a recorded Bitget login acknowledgement and asserts
      `isAuthenticated` becomes `true`; it fails against the current schema
- [ ] A test replays a recorded Bitget position push and asserts the position
      is added to `accountState.positions` under its own key; it fails without
      the fix
- [ ] Two different symbols produce two entries, not one overwritten one
- [ ] The `as RawWsOrder` / `as RawWsPosition` casts in `bitgetWs.ts` are gone
- [ ] Bitunix behaviour is unchanged — its existing tests still pass untouched

## Out of scope

The exchange adapter refactor. Normalise at the boundary; do not start M2 here.

## Links

- [`docs/TODO.md`](../../TODO.md) item 3 — full analysis
- `src/stores/account.svelte.ts` — `updatePositionFromWs`, `updateOrderFromWs`
- `src/services/bitgetWs.ts` — `handleMessage()`
- [`FEAT-0016`](../features/FEAT-0016-exchange-adapter-interface.md) — the
  structural fix this is a stopgap for
- Archived engineering log, passes thirteen and sixteen — where it was found
