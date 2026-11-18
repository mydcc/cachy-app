---
id: FEAT-0825
title: Bind every bot to one account and show only the active account
type: feature
status: specced
priority: P2
milestone: none
editions: [pro, private]
area: exchange
data_class: A
adr: required
depends_on: [FEAT-0807]
parent: FEAT-0805
size: XL
estimate: 21
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
- **Review across accounts is opt-in aggregation.** "Prüfen" (FEAT-0812)
  shows the active account by default; a later explicit aggregate view may
  compare accounts and never merges them implicitly.
- **A new ADR is required** before implementation (front matter marks it):
  account binding is a money-path architectural decision — where the account
  id lives (document field vs execution context), how reservations and the
  guard system (FEAT-0822) scope per account, and what a deleted account does
  to its bots' armed state.

## Acceptance criteria

- [ ] The required ADR exists and is accepted before any implementation
      merges.
- [ ] A bot created while account A is active executes only against account
      A, including after switching to account B.
- [ ] All bot surfaces show only the active account's bots, positions and
      guards; the account switch is visible and immediate.
- [ ] Reservation and ownership (ADR-0026, FEAT-0822) never collide across
      accounts — the same symbol on two accounts is two legitimate
      reservations, not a conflict.
- [ ] Deleting or disconnecting an account with armed bots produces an
      explicit, honest state (e.g. `blocked: account unavailable`) — never a
      silent fire or a silent stop.
- [ ] Money-path tests: per-account balances, fees and PnL stay strictly
      separated under `Decimal`. 👤 Human review recommended before merge.

## Out of scope

- Cross-account netting or hedging (out by construction: one bot, one
  account).
- Portfolio views across accounts (later, opt-in aggregation).
- Live execution (FEAT-0035 remains the gate for `send`-level anything).

## Open questions

- Where the account binding lives — document field (hashed, visible,
  versioned) vs execution context (flexible, not part of the strategy
  meaning). Proposal: context, because the *strategy* is account-agnostic;
  the ADR decides.
- Whether template exports (FEAT-0818) strip the account binding.
  Proposal: yes — a template is strategy data, never account data.

## Links

- [`ADR-0026`](../../adr/0026-a-bot-owns-the-position-it-opens.md)
- [`FEAT-0805`](FEAT-0805-bot-system-v2-from-conditional-orders-to-strategies.md)
- [`FEAT-0822`](FEAT-0822-bot-firing-policy-and-guards.md)
- [`IDEA-0830`](../ideas/IDEA-0830-open-extension-architecture.md)
- Code: `src/services/exchangeAccount*.ts`, `src/stores/paperTrading.svelte.ts`
