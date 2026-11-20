---
id: FEAT-0825
title: Bind every bot to one account and show only the active account
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: exchange
data_class: A
adr: required
depends_on: [FEAT-0807]
parent: FEAT-0805
size: M
estimate: 8
assignee: claude
branch: feature/feat-0825-bot-account-binding
---

# FEAT-0825 — Bind every bot to one account and show only the active account

## Problem

Cachy supports multiple brokers and multiple accounts. A bot system without
account binding answers the owner's fleet question wrongly: twenty bots on
account A and twenty on account B would blur into one list, one risk pool and
one journal — with real money on both sides. The product owner's decision
(review round, 2026-11-18): this is its own item, "it is about money, we
have to work extremely precisely", and only the **active** account is shown.

## Proposal

- **One bot, one account.** A bot document (or its execution environment)
  names exactly one venue account; evaluation, orders, positions and journal
  attribution are bound to it. A bot never executes against another account,
  even if that account is active in the UI.
- **Active-account view.** All bot surfaces — sidebar rows, workshop lists,
  guard states, positions — filter to the currently active account. Nothing
  from other accounts is silently mixed in; switching accounts switches the
  view (with the switch itself obvious, not a filter to discover).
- **Adapter principle.** The bot engine stays account-agnostic; an adapter
  per venue account carries the binding and must keep `OrderGate` and book
  semantics identical across accounts. This is the same edge-adapter shape
  the open-architecture idea proposes ([`IDEA-0830`](../ideas/IDEA-0830-open-extension-architecture.md))
  — building it per-account here is the first concrete use.
- **Review across accounts is opt-in aggregation.** The journal's
  per-bot review (FEAT-0812) shows the active account by default; a later
  explicit aggregate view may compare accounts and never merges them
  implicitly.
- **A new ADR is required** before implementation (front matter marks it):
  account binding is a money-path architectural decision — where the account
  id lives (document field vs execution context), how reservations and the
  guard system (FEAT-0822) scope per account, and what a deleted account does
  to its bots' armed state.

## Acceptance criteria

- [x] The required ADR exists and is accepted before any implementation
      merges. ADR-0028, accepted by the owner on 2026-11-20.
- [x] A bot created while account A is active executes only against account
      A, including after switching to account B. Under ADR-0028 a bot's
      account is the paper account, resolved by `botAccountOf` and never from
      the active account; `botAccountSeparation.test.ts` switches the
      exchange account under an open bot position and finds the bot's balance
      and position untouched.
- [x] All bot surfaces show only the active account's bots, positions and
      guards; the account switch is visible and immediate. The sidebar's bot
      tab and the workshop list hide paper bots while a live account is
      active and show a counted notice instead; the journal opens on the
      active account's trades.
- [x] Reservation and ownership (ADR-0026, FEAT-0822) never collide across
      accounts — the same symbol on two accounts is two legitimate
      reservations, not a conflict. The entry lane's open-position guard
      lost its live-account arm; a slot index is built from one book only.
- [x] Deleting or disconnecting an account with armed bots produces an
      explicit, honest state (e.g. `blocked: account unavailable`) — never a
      silent fire or a silent stop. A bot whose account is not executing
      reads `account_unavailable`; both lanes keep refusing with
      `paper-trading-off`, and held positions stay untouched.
- [x] Money-path tests: per-account balances, fees and PnL stay strictly
      separated under `Decimal`. 👤 Human review recommended before merge.

## Out of scope

- Cross-account netting or hedging (out by construction: one bot, one
  account).
- Portfolio views across accounts (later, opt-in aggregation).
- Live execution (FEAT-0035 remains the gate for `send`-level anything).

## Decisions (owner, 2026-11-20)

The spec assumed bots trading account A and account B. The code has one
paper book for every exchange account, and bots only ever trade it, so the
binding question became which model of paper to adopt. Recorded in
[`ADR-0028`](../../adr/0028-a-bot-executes-against-one-account.md):

- **Paper is an account of its own.** Every `simulate` bot is bound to it;
  per-account paper books were rejected (XL, a migration of the existing
  book, orphaned books on account deletion). A real A/B split arrives with
  the `send` level (FEAT-0035), which must store an explicit account id.
- **The binding lives in the execution context.** For `simulate` it is
  derived and stores nothing, so the hash does not move and a template
  (FEAT-0818) carries no account without a stripping step.
- **All editions.** Multi-account support shipped to all editions, so the
  money boundary does too.

The size shrank with the first decision: what remained is the binding
function, an honest availability state, removing a guard's cross-account
read, and the surface filter.

## Links

- [`ADR-0026`](../../adr/0026-a-bot-owns-the-position-it-opens.md)
- [`ADR-0028`](../../adr/0028-a-bot-executes-against-one-account.md)
- [`FEAT-0805`](FEAT-0805-bot-system-v2-from-conditional-orders-to-strategies.md)
- [`FEAT-0822`](FEAT-0822-bot-firing-policy-and-guards.md)
- [`IDEA-0830`](../ideas/IDEA-0830-open-extension-architecture.md)
- Code: `src/stores/account.svelte.ts`,
  `src/services/accountSession.svelte.ts`,
  `src/services/accountEpoch.svelte.ts`, `src/services/exchange/registry.ts`,
  `src/stores/paperTrading.svelte.ts`
