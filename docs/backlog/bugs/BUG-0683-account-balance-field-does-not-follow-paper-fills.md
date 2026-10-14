---
id: BUG-0683
title: Account Balance field keeps a stale value after a paper fill
type: bug
status: ready
priority: P2
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
# assignee:            # required while status: in-progress
---

# BUG-0683 — Account Balance field keeps a stale value after a paper fill

## Symptom

With paper mode on, the Market Activity panel and the Portfolio field report
two different balances for the same simulated account.

Observed on 2026-10-14, after three paper fills that closed at a loss:

- Market Activity → `Available 7761.04 USDT` — correct, it follows the fills.
- Portfolio → Account Balance `7936.23802` — the value the *calculator* still
  sizes against, unchanged since some earlier read.

The difference is the realised loss the fills booked, so the field is not
merely imprecise: it is a different number the whole position size is derived
from. Nothing on screen says which of the two is current.

## Evidence

**Demonstrated in the UI; mechanism derived from the code.** The screenshot
above is the observation — nobody has written a test for it. The two numbers
have two sources, and only one of them is re-read after a fill.

The panel reads `accountState`, which `paperTradingService` hydrates from the
simulated book on every book change
(`src/services/paperTradingService.ts:266`):

```ts
const account = feed.accountInfo();
accountState.hydrateBalance({
    available: account.available, ...
}, "paper");
```

`accountInfo().available` and `PaperAccountFeed.balance()` are both
`paperState.balance`
(`src/services/paperAccountFeed.ts:224`, `:249`), and a fill moves it
(`src/services/paperExchange.ts:849` on open, `:909` on close, via
`paperState.setBalance`, `src/stores/paperTrading.svelte.ts:401`). That is why
the panel is always current.

The field reads `tradeState.accountSize` instead. `src/routes/+page.svelte:435`
binds it, and only two sites ever write it:

- `handleAccountSizeInput` — the trader typing
  (`src/components/inputs/PortfolioInputs.svelte:114`).
- `handleFetchBalance` — the refresh button, and `onMount` **only** when
  `settings.autoFetchBalance` is set
  (`src/components/inputs/PortfolioInputs.svelte:155`, `:168` for the paper
  branch, `:237`–`:240`).

Neither runs on a fill. `localAccountSize` (`:73`) mirrors the prop one way,
and its `$effect` (`:84`) only ever copies prop → input, never the reverse. So
after the last read the field holds whatever `paperState.balance` was *then*,
for the rest of the session.

The panel is not stale because it reads a different store; the field is stale
because nothing reads it back.

## Cause

In paper mode the balance is an *observation* of the simulated account, but
`tradeState.accountSize` is a *user input* that is only refreshed on demand.
FEAT-0327 established the intended contract — its acceptance criteria read
"with paper mode on, `#account-size` fills from the simulated balance" — and
delivered it for the one-shot read. What was never delivered is the second
half: the field following the account *again* once a fill has moved it.

## Fix

Make the field follow the simulated balance while paper mode is on, with a
session-scoped override for a deliberate what-if value.

1. **Mirror on change.** A new `$effect` in
   `src/components/inputs/PortfolioInputs.svelte` writes the bound
   `accountSize` from `paperState.balance` whenever paper mode is on. Reading
   the reactive `paperState.balance` is what makes a fill reach the field.
   Guard with an equality check so the effect settles after one pass instead of
   re-notifying `tradeState` on every evaluation.
2. **Do not fight the trader.** Skip the write while `isAccountSizeFocused`
   (the same guard `:84` already uses — a write mid-typing moves the caret), and
   while the override below is held.
3. **Session-scoped override.** `let isAccountSizeUserEdited = $state(false)`.
   `handleAccountSizeInput` sets it `true`; `handleFetchBalance` sets it `false`
   in **both** branches, because the refresh button is the trader's explicit
   "read it again" gesture. The flag is *not* persisted: a fresh session starts
   willing to follow the account, which is what makes the field current for
   everyone who never typed into it — the reported case.
4. **Live mode is untouched.** Everything above sits behind
   `paperState.enabled`, so with paper mode off the effect writes nothing and
   the field behaves exactly as it does today.
5. **The effect also covers `autoFetchBalance: false`.** With the switch off
   and paper mode on, the field currently sits on the persisted default
   (`"1000"`, `src/stores/trade.svelte.ts:204`) until the trader presses
   refresh. Mirroring on change removes that too — same defect, same code path,
   so it is in scope rather than a separate item.

Leave alone: `paperState.balance` and when it is written, `handleFetchBalance`'s
network branch, the Authentication/`keyForActiveAccount` handling, and the
`riskPercentage`/`riskAmount` fields.

## Acceptance criteria

Each criterion is a `*.component.test.ts` case in the `components` project,
RED before the fix, per the `PortfolioInputs.component.test.ts` precedent
(FEAT-0346).

- [ ] With paper mode on and a mocked `paperState`, changing `paperState.balance`
      writes the new value into the bound `accountSize` and into the input's
      value, with no click, focus or mount-time fetch involved
- [ ] After `handleAccountSizeInput` has run, a later `paperState.balance` change
      leaves the typed value untouched
- [ ] Clicking the refresh button in the paper branch writes the current
      `paperState.balance` **and** releases the override, so the *next* balance
      change is mirrored again
- [ ] While the field is focused, a `paperState.balance` change does not
      overwrite the input
- [ ] With paper mode off, a `paperState.balance` change writes nothing to
      `accountSize` — live behaviour is unchanged
- [ ] Enabling paper mode with an untouched field mirrors the balance without a
      refresh click, with `autoFetchBalance` false
- [ ] `paperState.balance` is read as the source; no second balance is computed
      in the component

## Out of scope

- **Persisting the override across a reload.** Deliberately session-scoped
  (decision below). A trader who wants a fixed sizing basis has Risk Amount
  lock; the refresh button hands the field back.
- **Live-mode balance tracking.** Refreshing the field from a WS balance push,
  or on live mode in general, is not touched here. FEAT-0327 covers the live
  reads; this item is the paper follow-up.
- **Margin accounting.** `paperState.balance` still charges the fee on open and
  nothing else. Unchanged, and still FEAT-0327's listed follow-up.
- **Making the field read-only in paper mode.** Rejected variant; the override
  is what keeps a what-if possible.
- **`riskPercentage` / `riskAmount` mirroring**, and the `available`/`total`
  split the panel prints.

## Open questions

None that block the start.

- Decided (owner, 2026-10-14): the override is **session-scoped**, released by
  the refresh button and by the next reload. A hand-typed value therefore does
  not survive a reload while paper mode is on. The alternative — a persisted
  `accountSizeUserSet` flag — was considered and rejected as a larger change to
  a persisted schema for a case no one has reported.
- Not decided, does not block: whether switching paper↔live should also release
  the override. Left as "no, the refresh button is the explicit gesture";
  revisit if a mode switch ever leaves a trader surprised.

## Links

- FEAT-0327 — the read seam and the `#account-size` contract this completes
  (`docs/backlog/features/FEAT-0327-paper-trading-account-tracking.md`)
- FEAT-0346 — the focus guard and the component-test convention reused here
- `src/components/inputs/PortfolioInputs.svelte` — the field, the fetch and the
  guard
- `src/stores/trade.svelte.ts` — `tradeState.accountSize` and its default
- `src/services/paperAccountFeed.ts`, `src/services/paperTradingService.ts`,
  `src/services/paperExchange.ts` — where the simulated balance is read and
  moved
- `src/routes/+page.svelte` — the binding that joins the two
- ADR-0001 — both the paper balance and `accountSize` stay on the device
