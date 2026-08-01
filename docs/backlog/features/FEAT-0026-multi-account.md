---
id: FEAT-0026
title: Support several exchange accounts with an unmistakable active one
type: feature
status: specced
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: A
adr: none
depends_on: [FEAT-0016]
---

# FEAT-0026 — Support several exchange accounts with an unmistakable active one

## Problem

One set of credentials at a time. Traders who separate strategies across
sub-accounts, or run one exchange for perpetuals and another for spot, cannot.

## Proposal

Several named accounts, each with its own credentials and exchange, switchable.

**This is a safety feature wearing a convenience feature's clothes.** The
failure mode is placing a trade on the wrong account, which is unrecoverable and
entirely silent. So:

- the active account is unmistakable wherever an order can be placed — not only
  in a header
- switching accounts is an action with a confirmation by default
      ([`FEAT-0024`](FEAT-0024-confirmation-policy.md))
- the [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) gate verifies the
  target account against the displayed one, which is already in its checked set
- positions, orders and balances are never mixed across accounts in a view
  without labelling

Credentials remain Class A, one encrypted entry per account under the existing
master-password scheme.

## Acceptance criteria

- [ ] Several accounts can be configured, named and switched
- [ ] Each account's credentials are encrypted independently
- [ ] The active account is visible on every order-placing surface
- [ ] The verification gate refuses an order whose target account differs from
      the displayed one, with a test
- [ ] No view shows data from two accounts without labelling
- [ ] Switching clears cached account state rather than blending it, with a test
- [ ] German and English strings

## Links

- `src/stores/settings.svelte.ts` — `SENSITIVE_KEYS`, encryption
- `src/stores/account.svelte.ts`
