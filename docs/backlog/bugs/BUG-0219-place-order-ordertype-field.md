---
id: BUG-0219
title: place_order never received an order type, so every limit order failed
type: bug
status: done
branch: claude/feat-0011-erledigen-k3fht2
priority: P1
milestone: M3
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
start_date: 2026-08-16
target_date: 2026-08-16
size: S
estimate: 2
---


# BUG-0219 — `place_order` never received an order type, so every limit order failed

## Symptom

Placing a limit order returns HTTP 500 from `/api/orders`, and the panel shows:

> The order was not placed.
> apiErrors.generic

Two faults: the order genuinely failed, and the reason was hidden behind a
translation key.

## Evidence

**Demonstrated** — reported from `dev.cachy.app`, and reproduced by a test that
inspects the outbound request body: `orderType` is `undefined` on the wire.

The two pieces of code that disagree:

- `docs/bitunix-api/07_trade.md:584` — place_order's request table lists
  `orderType` as **required**: "Ordertyp: `LIMIT` / `MARKET`". The curl example
  on line 607 sends `"orderType":"LIMIT"`.
- `src/routes/api/orders/+server.ts` — built its outbound payload with
  `type: payload.orderType`, and `BitunixOrderPayload` declared the field as
  `type`. The object is `JSON.stringify`-ed straight onto the wire, so what
  Bitunix received was a `type` field it does not document and **no
  `orderType` at all**.

## Cause

A field-name mismatch between Cachy's own request schema (`orderType`, correct)
and the exchange payload type (`type`, wrong). The comment on the line even
read "Correct field from schema", which is how it survived review.

It went unnoticed for so long because until [`FEAT-0069`](../features/FEAT-0069-bitunix-place-order-completion.md)
the only caller was `close-position`, which hardcodes MARKET — whatever Bitunix
does with a missing `orderType`, it matched what that path wanted. The first
LIMIT order placed through this route is what surfaced it. Closing positions
was working by luck, not by correctness.

The second fault is separate: `BitunixApiError` deliberately carries the i18n
key `"apiErrors.generic"` in `message` and the exchange's own text in
`rawMessage`. `orderPlacementService` read `e.message`, so the one string that
says *why* the order failed was discarded and the key was rendered verbatim.

## Fix

- `BitunixOrderPayload.type` → `orderType`, and the three construction and read
  sites in `+server.ts`. The LIMIT-price check reads the renamed field too — it
  would otherwise have silently stopped checking anything.
- `orderPlacementService` uses `getDisplayMessage(e)`, which prefers
  `rawMessage`, so the exchange's text reaches the panel.
- The panel puts the detail through `$_` before showing it. svelte-i18n echoes
  an unknown key, so real exchange prose passes through untouched while a key
  like `apiErrors.generic` is translated instead of printed.

**Left alone:** the `type` discriminator on Cachy's *own* request schema
(`type: "place-order"`). That is the request kind and unrelated. The paper
simulator reads `payload.orderType` at the API level and is unaffected.

## Acceptance criteria

- [x] A test reproduces the defect and fails without the fix
- [x] The test passes with the fix
- [x] `orderType` appears on the outbound request for LIMIT, MARKET and
      close-position, and `type` does not
- [x] A LIMIT order without a price is still rejected before any request
- [x] The exchange's own error text reaches the user instead of a key
- [ ] Verified live against a funded account — **not done**, see below

## Not verified

Whether Bitunix now accepts the order is not something this repo can answer.
The fix makes the request match the documented shape and the documented
example; it does not prove the order books. That needs one live limit order on
a funded account, and if it still fails, the error text will now say why —
which it did not before.

## Links

- [`docs/bitunix-api/07_trade.md`](../../bitunix-api/07_trade.md) — place_order
- [`FEAT-0069`](../features/FEAT-0069-bitunix-place-order-completion.md) — made this
  path reachable for the first time
- [`FEAT-0021`](../features/FEAT-0021-order-types.md) — the panel that placed it
- [`BUG-0215`](BUG-0215-order-refusal-placeholders.md),
  [`BUG-0216`](BUG-0216-i18n-interpolation-values.md) — the same day's other two
  cases of a key reaching the user instead of a message

## What shipped

Shipped in 1.6.0-beta.54.
