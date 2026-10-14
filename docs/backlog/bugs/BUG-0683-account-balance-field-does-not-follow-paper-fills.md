---
id: BUG-0683
title: Account Balance field keeps a stale value after a paper fill
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
assignee: opencode
branch: fix/account-balance-follows-paper-fills
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
   (the same guard the prop-to-local effect already uses — a write mid-typing
   moves the caret), and while the field still holds the trader's own number.
3. **The override is a value, not a latch**, and it is session-scoped.
   `let userAccountSize: string | null = $state(null)` holds the text the trader
   typed. `handleAccountSizeInput` records it; `handleFetchBalance` clears it in
   **both** branches, because the refresh button is the trader's explicit "read
   it again" gesture. The guard is
   `userAccountSize !== null && format(accountSize) === userAccountSize`, so the
   override ends as soon as the field no longer holds that number — which is
   what lets a preset load or a Reset hand the field back instead of leaving the
   mirror switched off for good. Nothing is persisted: a fresh session follows
   the account again, which is what makes the field current for everyone who
   never typed into it — the reported case.
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

- [x] With paper mode on and the real `paperState` store, changing
      `paperState.balance` writes the new value into the bound `accountSize`,
      into the store and into the input's value. The field and the store are one
      cell, as `bind:` makes them, so the two cannot disagree
- [x] After `handleAccountSizeInput` has run **and the field has lost focus**, a
      later `paperState.balance` change leaves the typed value untouched. Blurred
      on purpose: with the caret still in the field the caret guard alone would
      mask a value nothing protects
- [x] Clicking the refresh button in the paper branch writes the balance the read
      returned **and** releases the override, so the *next* balance change is
      mirrored again — including when the trader's number happens to equal the
      balance, which the value comparison alone cannot tell from an untouched
      field
- [x] A preset load or a Reset writing `accountSize` releases the override too,
      and the mirror follows the account again
- [x] While the field is focused, a `paperState.balance` change does not
      overwrite the input
- [x] A fill skipped while the field was focused is picked up on blur
- [x] With paper mode off, a `paperState.balance` change writes nothing to
      `accountSize` — live behaviour is unchanged
- [x] Enabling paper mode with an untouched field mirrors the balance without a
      refresh click, with `autoFetchBalance` false
- [x] `paperState.balance` is the only source; no second balance is computed in
      the component

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

## State

Fixed on branch `fix/account-balance-follows-paper-fills`.

`src/components/inputs/PortfolioInputs.svelte` gained one `$effect` and one
piece of session state:

- The effect writes the bound `accountSize` from `paperState.balance` while
  paper mode is on. It reads the balance only *after* the guards, so while paper
  mode is off it holds no subscription to the book at all, and releasing a guard
  re-reads the current balance instead of replaying a stale one.
- `accountSize` is a dependency of the effect, not an untracked read. That
  dependency is the whole of the second round: the first cut held a latch
  boolean, set by typing and cleared only by an explicit read, and because the
  effect was not subscribed to `accountSize` a preset load or a Reset left the
  latch set and the mirror switched off — the reported symptom again, one click
  away. The guard now compares against the value the trader typed, so whatever
  else lands in the field hands it back.

Verified by `src/components/inputs/PortfolioInputs.component.test.ts` — thirteen
cases, nine of them for this bug. Every piece of the fix was removed on its own
and watched failing for its own reason, so each one is pinned by at least one
case rather than merely present:

| code removed | cases that fail |
| --- | --- |
| the write | eight — every mirror case but the paper-off one, the field stuck on the old value |
| `userAccountSize = value` | two — the typed value is overwritten, and the hand-back case |
| the value comparison, back to a latch | one — the preset/Reset case |
| the release in `handleFetchBalance` | one — the equal-number hand-back case |
| the caret guard | one — the focused case |
| the paper-mode guard | three — the paper-off case and two FEAT-0346 cases |

The release in `handleFetchBalance` is the one worth a second look: the value
comparison already hands the field back whenever the read returns a different
number, so that release is load-bearing only when the trader's number *is* the
balance. The fourth row is that case, and it is the reason the release is not
dead code.

Two harness facts the next reader will otherwise trip over:

- `paperState` is **not** mocked; the real store is used. The defect is a missing
  *signal* subscription and a plain-object mock never re-runs an effect, so a
  mock could not have caught it.
- The field and the store are **one cell** in the tests — a `SvelteMap` behind
  both the prop accessors and the mocked store — the way `bind:` makes them one.
  They started as two, which let the field disagree with the store while every
  assertion stayed green: the shape of this bug rather than a coincidence.

Both limits recorded under Open questions shipped as decided: the override is
session-scoped, and a paper-to-live switch does not release it. A third became
visible while wiring the value comparison and is now pinned by a test instead of
left implicit: in paper mode a preset's own `accountSize` is replaced by the
simulated balance, because in paper mode the simulated account is what this
field sizes against.


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
