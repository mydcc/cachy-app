---
id: BUG-0059
title: A failed account-balance fetch is silently swallowed, indistinguishable from a genuinely empty account
type: bug
status: done
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
start_date: 2026-08-08
target_date: 2026-08-13
size: S
estimate: 2
---


# BUG-0059 — A failed account-balance fetch is silently swallowed, indistinguishable from a genuinely empty account

## Symptom

Reported while chasing BUG-0058: with a real open position on the exchange,
the Account Summary tooltip shows every field at zero — Available, Total
Equity, Margin Level, Wallet Balance, Transferable, Bonus, Frozen, Cross
PnL, Mode "-" — with no error message anywhere. These are exactly the
hard-coded initial defaults of `accountInfo` in `PositionsSidebar.svelte`,
meaning it was never actually updated with real data.

## Evidence

**Demonstrated by code inspection, not a live reproduction** (no live keys
available in this environment).

`fetchAccount()` (`src/components/shared/PositionsSidebar.svelte`,
pre-fix):

```ts
const data = await response.json();
if (!data.error) {
  accountInfo = data;
  accountState.hydrateBalance({ ... });
}
```
```ts
} catch (e) {
  if (import.meta.env.DEV) {
    console.error(e);
  }
}
```

If the server responds with `{ error: ... }` (any exchange-side failure —
auth, signature, rate limit, permissions), the `if` branch is skipped
entirely: `accountInfo` is never reassigned, stays at its all-zero initial
`$state`, and nothing renders an error. The `catch` block is just as
silent outside dev builds (`console.error` gated on `import.meta.env.DEV`
does nothing in a production build the user is actually running). A
genuinely empty account and a completely failed fetch look identical to
the user — this is why the report could not be told apart from "the
account really has no data" without opening the browser's network
inspector.

Contrast with `fetchPositions()`, which already sets `errorPositions` and
renders it in `PositionsList.svelte` — `fetchAccount()` had no equivalent.

## Cause

`fetchAccount()` predates the pattern the other three fetchers
(`fetchPositions`, `fetchPendingOrders`, `fetchHistoryOrders`) already use
(a dedicated `error*` state surfaced in the corresponding list component)
and was never brought in line with it.

## Fix

Added `errorAccount` state, set from `translateError(data)` on an API
error response and from `apiErrors.generic` on a thrown exception (matching
the other three fetchers), cleared on success. Passed through to
`AccountSummary.svelte` as a new `error` prop, rendered as a visible
message at the top of the summary.

This does not by itself explain *why* the account fetch is failing for the
reporting user — it makes the failure visible so the actual server
response (status code, error body) can be captured on the next report
instead of guessed at.

## Acceptance criteria

- [x] An account-fetch API error is shown to the user instead of silently
      leaving every field at zero
- [x] A thrown exception (network failure) is shown too, not just
      dev-console-logged
- [x] Successful fetches clear any previously shown error
- [x] `npm run check` and the full Vitest suite pass

## Open question

What is actually failing for the reporting user's account — auth,
signature, exchange-side rate limiting, or a genuinely empty response being
misread as populated data elsewhere (e.g. `fetchPositions`' Bitunix
position-size filter dropping a position whose `qty` field doesn't match
any of the three field names it checks)? Needs the actual error text (now
visible) or a Network-tab response body from the reporting user to pin
down — deliberately not guessed at further here.

## Links

- `src/components/shared/PositionsSidebar.svelte` — `fetchAccount()`
- `src/components/shared/AccountSummary.svelte`
- [`BUG-0058`](BUG-0058-ws-position-update-missing-qty-closes-position.md) —
  the report that surfaced this while re-testing

## What shipped

Shipped in 1.2.0-beta.32.
