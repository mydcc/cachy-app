# ADR-0023: Bitget speaks UTA only; Classic is refused, not ported

- **Status:** Proposed
- **Date:** 2026-10-05
- **Deciders:** mydcc (user-directed, 2026-10-05)

## Context

Bitget gates every Classic REST path for UTA accounts with `40085 "You are in
Unified Account mode, and the Classic Account API is not supported at this
time"`, fired before signature validation — a wrong secret returns the same
`40085`, so the code proves nothing about signing either way. New accounts land
in UTA, which the vendor marks recommended and Classic legacy. A Classic-V2
port (`/api/v2/mix/*`) would therefore be correct for Classic accounts and dead
on arrival for UTA ones. Verified live 2026-10-03 against `api.bitget.com` and
recorded in `docs/bitget-api/14_uta_v3.md:19-38`.

What UTA is: not `/api/v3/mix/*` with a new number but regrouped
`/api/v3/account/*`, `/api/v3/trade/*`, `/api/v3/position/*` parameterised by
`category` instead of `productType`, with cursor pagination and a different
order envelope (`14_uta_v3.md:86-87`). Guessed V3 paths (`/api/v3/mix/…`,
`/api/v3/contract/…`, `/api/v3/trade/orders-pending` etc.) return `40404` and
are recorded there so nobody repeats them (`:77-84`).

The code has already moved that way: `BITGET_ORDER_PATHS` in
`src/utils/exchange/restSigningPlan.ts:298-304` points `place-order` and
`close-position` at `/api/v3/trade/place-order`; `src/utils/exchange/venueBodies.ts:90-126`
requires `posSide` on hedge closes; `src/utils/exchange/bitgetUtaWrites.test.ts:19-29`
pins "UTA has no `tradeSide` request field"; signed reads are covered by
`src/utils/server/venues/bitgetUtaReads.test.ts:157,202,233,300`. Public market
data still rides unauthenticated `/api/v2/mix/market/*`
(`src/utils/server/venues/bitget.ts:457-459`) and keeps working. The socket is
public-only today: `WS_URL` is `wss://ws.bitget.com/v2/ws/public`
(`src/services/bitgetWs.ts:60`); private channels are refused with a log line
pointing at `wss://ws.bitget.com/v2/ws/private` plus login (`:703`, `:798-811`).
The 40085 gate is REST-only — a UTA account logs into `v2/ws/private` fine
(`14_uta_v3.md:36-38`), and `v3/ws/private` answers login with JSON number
`code: 0` (`:210-232`).

Against deciding now: several UTA behaviours are observation-gated, not
verified — `posSide`-omission behaviour, `clientOid`-resubmission, the one-way
`holdMode` wire literal, funding/fee behaviour (BUG-0597 Phase A recon). There
are no demo API keys, only live-account keys, so verification costs real cents
on the trader's account and agents never hold keys (`14_uta_v3.md:234-249`).
The positions endpoint also answered HTTP 200 with a zero-byte body twice on an
unchanged account (`:110-136`) — a shape no parser can branch on.

## Decision

**Cachy targets Bitget UTA (`/api/v3/*`) exclusively. Classic (`/api/v2/mix/*`,
`/api/mix/v1/*`) is not ported; a `40085` is surfaced as an explicit
"Classic/UTA mismatch" refusal with guidance, never retried or silently
absorbed.**

Concretely:

- Signed REST targets `/api/v3/*` with `category` (`account/assets`,
  `trade/unfilled-orders`, `trade/fills`, `trade/place-order`,
  `trade/modify-order`, `trade/cancel-order`, `trade/cancel-symbol-order`,
  `trade/close-positions`, `trade/order-info`, `position/current-position`).
- Order intent splits as `side` + `posSide` in hedge mode (close long =
  `side: sell` + `posSide: long` — the mirror of Classic, so the mapping is
  per-generation and must not be shared) and `side` + `reduceOnly` without
  `posSide` in one-way mode. There is no `tradeSide` request field; `size`,
  `timInForceValue`, `marginCoin`, `productType` in a Bitget body are refused
  (`bitgetUtaWrites.test.ts:190`).
- Responses are read as `{list, cursor}` objects, never bare arrays, with a
  null guard (`fills` answered `list: null` where `unfilled-orders` answered
  `list: []`). A zero-byte 200 is "no data, retry", not an error to surface.
- `filled` reads `cumExecQty` (aggregate) / `execQty` (single fill); `filledQty`
  exists in no generation (`14_uta_v3.md:138-164`).
- Query-parameter byte order stays insertion order for V3 — both orders return
  `00000` with a wrong-secret `40009` control (`:188-208`). No sorting change.
- No `clientOid` idempotency is assumed (undocumented) — therefore no write
  retries until a duplicate is observed rejected. No `set-position-mode`
  endpoint exists — mode switches happen in the venue app UI; `posMode` is read
  from the account response.
- Exception: unauthenticated public market data stays on `/api/v2/mix/market/*`
  until UTA public-market parity is verified — it works regardless of account
  mode and needs no key.

## Consequences

### What this enables

- One order schema to verify instead of two mirrored ones with opposite close
  sides; the Classic `tradeSide`-drop trap (valid open instead of close) leaves
  the codebase with the UTA `posSide` rule, which is documented required.
- BUG-0580's V3 half closes with no code change; BUG-0590/0589 shed their
  Classic halves and keep one fixture (a *filled* UTA order) outstanding.

### What this costs

- Classic-holdout users lose Bitget support until they migrate accounts in the
  venue UI — a real breakage for them, communicated, not silent.
- Every remaining UTA unknown is settled trader-side on a live account during
  normal trading (cents per probe, no demo path, no agent-held keys).
- The public market-data exception leaves one V2 dependency in place that a
  future change must still retire.

### What is now forbidden

- No new signed Bitget path under `/api/mix/v1/*` or `/api/v2/mix/*`; review
  rejects any diff that adds one.
- No `tradeSide`, `timInForceValue`, `size`, `marginCoin` or `productType` in a
  Bitget request body — refused at the body builder, never dropped silently.
- No `side`-only close: a hedge close without `posSide`, or `posSide` together
  with `reduceOnly`, fails validation before signing.
- No `res.data || []` iteration over a UTA response; parsers read `data.list`
  with a null guard and treat a zero-byte 200 as retryable no-data.
- No carrying V3 observations across to Classic (or vice versa): a finding
  names its generation or it does not land.
- No write retry on `clientOid` and no programmatic mode switch until each is
  observed, not documented.

## Alternatives considered

**Dual Classic + UTA support.** Rejected: doubles the order-schema matrix with
opposite close sides per generation, and every Classic verification needs a
Classic-mode account nobody holds. Kept only as the refusal message, not as
code.

**Classic-only V2 port (finish BUG-0576 as written).** Rejected: correct for
legacy accounts, `40085`-dead for every UTA account including all new ones —
the migration's premise, invalidated by the live gate.
