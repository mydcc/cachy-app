---
id: FEAT-0229
title: Refuse an order verb the venue cannot do before it leaves the client
type: feature
status: specced
priority: P1
milestone: M2
editions: [community, pro, private]
area: exchange
data_class: none
adr: ADR-0007
depends_on: [FEAT-0016]
estimate: 2
size: S
target_date: 2026-11-19
---

# FEAT-0229 — Refuse an order verb the venue cannot do before it leaves the client

## Problem

A trading verb the active exchange has no verified format for still travels.
On Bitget, `cancelTpSlOrder` and `modifyTpSlOrder` are built, signed and sent,
and `routes/api/tpsl/+server.ts:58` refuses them at the far end. The user's
stop is not moved, and what they see is whatever the generic API-error path
renders.

The industry rule is the opposite one — *pre-trade control*: what the venue
will certainly reject does not leave the system. MiFID II's RTS 6 requires
exactly this of algorithmic trading firms, and venues enforce it commercially
through order-to-trade and message-efficiency ratios. Sending a request whose
rejection is already known is not neutral; it is a defect.

Cachy has three lines of defence available and currently only the outermost:

| Line | Where | State |
|---|---|---|
| The control is not offered | [`FEAT-0017`](FEAT-0017-exchange-capability-model.md) | not built |
| The adapter refuses locally | `services/exchange/` | **missing — this item** |
| The venue refuses | `routes/api/tpsl/+server.ts:58` | works |

The middle line is the one that still holds when the first is bypassed: a
panel left open across an exchange switch, a keyboard shortcut, a stale
capability read. [`FEAT-0016`](FEAT-0016-exchange-adapter-interface.md) built
the declaration it needs (`ExchangeAdapter.supports`) but deliberately did not
act on it, because acting on it is a user-visible change — see
[`ADR-0007`](../../adr/0007-exchange-adapter-boundary.md), last alternative.

## Proposal

The adapter refuses a verb its `supports` declaration marks absent, before any
request is built, and it treats reading and writing differently:

- **Reading** (`fetchTpSlOrders`) resolves empty. "There are no plans here" is
  a true answer and carries no risk.
- **Writing** (`cancelTpSlOrder`, `modifyTpSlOrder`, and any later verb behind
  a `supports` flag) throws `ExchangeUnsupportedError` carrying an i18n key
  naming the venue and the verb. A write must never resolve quietly — a stop
  that was silently not moved is the worst outcome in this file.

New strings go into `src/locales/` in German and English.

## Acceptance criteria

- [ ] With `supports.tpSl === false`, no write verb reaches `tradeService` —
      proven by a test asserting the transport was never called
- [ ] A read verb on the same venue resolves empty and raises no error
- [ ] `ExchangeUnsupportedError` renders through the existing toast path with a
      message naming the exchange and what it cannot do, in both locales
- [ ] Bitunix behaviour is byte-identical — the guard is reachable only through
      a false `supports` flag
- [ ] The refusal is independent of the UI: it holds when the verb is invoked
      directly, not only when a hidden control would have prevented it

## Out of scope

Hiding the controls. That is [`FEAT-0017`](FEAT-0017-exchange-capability-model.md),
the first line of defence; this item is the second and must work without it.

## Links

- [`ADR-0007`](../../adr/0007-exchange-adapter-boundary.md) — why FEAT-0016 declared the gap without acting on it
- `src/services/exchange/bitgetAdapter.ts` — the seam is marked in the file
