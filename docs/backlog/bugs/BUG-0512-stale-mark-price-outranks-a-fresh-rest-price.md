---
id: BUG-0512
title: A stale mark price outranks a fresh REST price, so every position's PnL keeps being recomputed from a frozen number during a WebSocket price gap
type: bug
status: in-progress
assignee: opencode
branch: fix-pkg-e-0504-0512
priority: P1
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
---

# BUG-0512 — The freshest price loses to the stalest one

## Symptom

During a gap in the Bitunix WebSocket `price` channel the positions panel keeps
showing a live-looking unrealized PnL for every open position. The number is
recomputed on every flush, so it reacts and looks alive — but it is priced from
the last mark price the WebSocket delivered, which can be arbitrarily old. A
*fresher* price for the same symbol is sitting in the same store object,
unread.

This is not the modal-snapshot freeze of `BUG-0347`. That one is about a value
not re-reading while a modal is open, and its fix is reactivity. This one
survives any amount of reactivity: re-reading a frozen source as often as you
like still yields the frozen value.

## Mechanism

Three facts compose.

**1. The REST fallback refreshes `lastPrice` and not `markPrice`.**
`src/services/marketWatcher/historyFetcher.ts:364` polls `fetchTicker24h` when
a channel goes quiet and writes exactly one price field:

```ts
lastPrice: data.lastPrice,
```

There is no `markPrice` in that write. `marketState.data[sym].markPrice`
therefore keeps whatever the last WebSocket push left there, for as long as the
gap lasts.

**2. `resolveMarkPrice` ranks by presence, not by age.**
`src/components/shared/PositionsSidebar.svelte:183`:

```ts
const live = symbolData?.markPrice;
if (live && live.gt(0)) return live;          // stale is still > 0
if (p.markPrice && p.markPrice.gt(0)) return p.markPrice;
const lastPrice = symbolData?.lastPrice;      // the fresh one — unreachable
if (lastPrice && lastPrice.gt(0)) return lastPrice;
```

The `lastPrice` fallback exists precisely for this situation — its own comment
names the WS gap. But it is guarded behind `markPrice` being absent, and a
stale `markPrice` is not absent. It is a positive number. Level 1 wins every
time, and the fresh price on level 3 is unreachable exactly when it is needed.

**3. The age is already recorded, on the same object.**
`MarketData.lastUpdated` (`src/stores/market/types.ts:46`) is stamped on every
flush by `applyUpdate.ts:26`, and `MarketWatcher.performPollingCycle`
(`marketWatcher.ts:138`) already reads it to decide whether to poll:

```ts
const lastUpdate = data?.lastUpdated || 0;
```

So the polling loop knows the data is stale. The consumer that prices money
reads the price off that same object and never looks at the field next to it.

## Why this is the closing half of BUG-0218

`BUG-0218` is `status: done` and asked for two remedies:

1. `pollSymbolChannel` populates `markPrice` during fallback polling.
2. `resolveMarkPrice` falls back to `lastPrice`.

Only (2) shipped. (1) is still missing at `historyFetcher.ts:371`, and (2)
alone cannot fire while (1) is missing — because the thing that would make
(2) fire is `markPrice` being absent, and without (1) it is present-but-frozen
rather than absent. The two halves were load-bearing for each other, and the
item closed on one of them.

## Financial consequence

`mappedPositions` (`PositionsSidebar.svelte:207`) recomputes every position's
PnL from this price:

```ts
calculateLiveUnrealizedPnl(p.side, p.entryPrice, markPrice, p.size)
```

and hands the same `markPrice` to every modal fed from that list. Downstream it
prices:

- unrealized PnL per position, and the panel total;
- `partialClose.ts::realizedPnlOnClose`, the realized PnL previewed before a
  partial close is confirmed;
- `AddToPositionContext.markPrice`, the fill price an add is previewed against;
- the distance between mark and liquidation, as displayed.

A trader deciding whether to cut a loser is reading a number computed from a
price that no longer exists. On a perp the substituted `lastPrice` is also not
the same quantity as the mark price — the venue liquidates off *mark*, and the
basis between them is exactly what widens in the volatile conditions that
cause WS gaps in the first place.

## Asymmetry that makes this a defect rather than a choice

Every other input on this surface has a maximum age. The price does not:

| input | age bound |
|---|---|
| account state (balance, leverage, fees) | `MAX_ACCOUNT_STATE_AGE_MS` = 60s, refuses the order (`orderGate.ts:1328`) |
| position | `MAX_POS_AGE_MS`, forces a refresh (`tradeService.ts:1038`) |
| klines per timeframe | `klinesLastUpdated`, drives the polling loop |
| **mark price** | **none** |

The infrastructure is present in all three neighbouring cases. The price is the
one that was left out, and it is the input that appears in every one of the
formulas above.

## Acceptance Criteria

- [ ] `resolveMarkPrice` rejects a `markPrice` older than a named maximum age,
      read from `MarketData.lastUpdated`, and falls through to the next source
      instead of returning it.
- [ ] `pollSymbolChannel` populates `markPrice` during fallback polling, or
      states in a comment why the venue makes that impossible and what is used
      instead.
- [ ] A price that came from `lastPrice` rather than `markPrice` is
      distinguishable by the caller — the two are not the same quantity and a
      PnL derived from the substitute should be able to say so.
- [ ] When no source is fresh enough, the PnL cell shows that it is unpriced
      rather than showing a stale number as live.
- [ ] Regression test: seed a `markPrice` with an old `lastUpdated` plus a fresh
      `lastPrice`, and assert the fresh one is chosen.
- [ ] Regression test: all sources stale — assert no PnL is produced rather
      than a stale one.

## Out of Scope

- The modal reactivity of `BUG-0347`. Separate defect, separate fix; both are
  needed and neither substitutes for the other.
- Bitget's mark-price behaviour. The mechanism above is Bitunix-specific
  because the REST gap is; whether Bitget's snapshot path has the same shape is
  its own question.
- Any change to how the gate prices an order. This item is about the displayed
  decision surface; whether a stale price can reach a payload is not claimed
  here and was not verified.
