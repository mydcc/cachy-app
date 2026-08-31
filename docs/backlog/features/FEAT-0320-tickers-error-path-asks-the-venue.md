---
id: FEAT-0320
title: Let the venue answer symbol-not-found on the tickers error path too
type: feature
status: in-review
priority: P3
milestone: M2
editions: [community, pro, private]
area: exchange
data_class: none
adr: ADR-0007
depends_on: [FEAT-0228]
estimate: 1
size: S
---


# FEAT-0320 — Let the venue answer symbol-not-found on the tickers error path too

## Problem

`routes/api/tickers/+server.ts` asks the same question twice and only routes
one of them through the venue module.

On a **200** response it asks the adapter:

```ts
if (venue.isSymbolNotFoundBody(data)) throw { status: 404, message: "Symbol not found" };
```

On a **non-2xx** response it still asks inline, with a condition byte-identical
to the one inside `bitunixVenue`:

```ts
if (data.code === 2 || data.code === "2" ||
    (data.msg && data.msg.toLowerCase().includes("system error"))) { … }
```

That inline copy is Bitunix's heuristic — `code: 2` is Bitunix's spelling —
and it runs for every venue. It is the last venue-specific branch left in a
route after [`FEAT-0228`](FEAT-0228-venue-modules-in-proxy-routes.md), found in
review of that item rather than by the item itself.

Harmless today: Bitget signals success with `code: "00000"` and reports a bad
symbol as a non-2xx with a real status, so the `code === 2` half never
matches. The `msg` half is not so clearly safe — nothing stops a Bitget 5xx
from carrying "system error" in its message, and it would then be reported to
the client as a 404 "Symbol not found".

## Proposal

Call `venue.isSymbolNotFoundBody(data)` on the error path as well, so both
paths ask the same venue the same question.

**Deliberately not folded into FEAT-0228.** That item's second acceptance
criterion is "the request/response contract is unchanged", and this changes
it: a Bitget non-2xx whose message contains "system error" stops being a 404
and starts carrying its real upstream status. That is almost certainly the
better answer — reporting a Bitget outage as "Symbol not found" sends the user
looking for a typo — but it is a behaviour decision, and it belongs in an item
that says so rather than inside a refactor.

While there: the surrounding `try { … throw … } catch (e) { if (isStatusError(e)) throw e }`
dance exists only to tell "the body was not JSON" apart from "we decided 404".
A plain `safeJsonParse` guard says the same thing without throwing through its
own catch.

## Acceptance criteria

- [ ] No venue-specific condition remains in `tickers/+server.ts`; both the
      200 and the non-2xx path resolve the question through the venue module
- [ ] A Bitunix non-2xx carrying `code: 2` or a "system error" message is
      still reported as 404 — unchanged
- [ ] A Bitget non-2xx is reported with its own upstream status, and a test
      covers the "system error" message case specifically
- [ ] The throw-through-own-catch in the error path is gone

## Out of scope

The other five proxy routes. They carry no venue-specific condition after
FEAT-0228; this one was missed because the check sits in an error path rather
than in the venue branch that item replaced.

## Links

- [`FEAT-0228`](FEAT-0228-venue-modules-in-proxy-routes.md) — the refactor this
  was found reviewing, and why it was not folded in
- [`ADR-0007`](../../adr/0007-exchange-adapter-boundary.md)
- `src/routes/api/tickers/+server.ts`, `src/utils/server/venues/bitunix.ts`
