---
id: BUG-0065
title: A partial WS price push can erase a real markPrice buffered earlier in the same flush window
type: bug
status: done
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [BUG-0055]
estimate: 3
size: M
target_date: 2026-09-17
---

# BUG-0065 — A partial WS price push can erase a real markPrice buffered earlier in the same flush window

## Symptom

Reported live: prices in the Market Activity panel (position mark price)
stay static even though Bitunix's own trade panel visibly moves for the
same symbol at the same time — "Der Kurs ändert sich im Bitunix
TradePanel aber auf Cachy bleibt er starr bei der einmal abgefragten
Daten."

## Evidence

**Demonstrated** — regression test
(`src/stores/marketStore.test.ts`, "does not let a later push omitting
markPrice erase one buffered earlier in the same flush window") fails
without the fix and passes with it.

`MarketManager.updateSymbol()` (`src/stores/market.svelte.ts`) buffers
incoming WS partials before a 250ms flush loop applies them:

```ts
const existing = this.pendingUpdates.get(symbol) || {};
this.pendingUpdates.set(symbol, { ...existing, ...partial });
```

Callers build `partial` objects like `bitunixWs.ts`'s price-channel
handler does: `{ markPrice: mp ? new Decimal(mp) : undefined }`. When a
push doesn't repeat `mp` (Bitunix's WS docs,
`docs/bitunix-api/08_websocket.md`, do not confirm every price-channel
tick repeats every field — the same undocumented-omission pattern already
confirmed for `qty` on the position channel, BUG-0058), `partial` still
carries an **explicit** `markPrice: undefined` key. A plain object spread
applies that key regardless of its `undefined` value, so a second push
landing in the same 250ms flush window — a normal occurrence, since the
WS throttle only limits updates to one per 200ms per symbol/channel —
silently overwrites a real, not-yet-flushed `markPrice` from an earlier
push in that same window with `undefined`. `applyUpdate()` (the flush
step) already guards against applying an `undefined` field to `current`,
but by then the real value buffered in `pendingUpdates` is already gone —
the guard never gets a chance to see it.

## Cause

`updateSymbol()`'s buffer merge used a plain object spread, which does not
distinguish "this field is intentionally absent from this push" from
"this field should reset to nothing" — both look like a present key with
value `undefined` after the ternaries callers use.

## Fix

`updateSymbol()` now merges only the keys of `partial` whose value is not
`undefined` into the buffered entry, leaving any real, not-yet-flushed
value already in the buffer untouched. `null` (used elsewhere to mean
"explicitly cleared", distinct from "not provided") still passes through
unchanged.

## Acceptance criteria

- [x] A push that omits a field (explicit `undefined`) does not erase a
      real value for that field buffered by an earlier push in the same
      flush window
- [x] A push that provides a real value (including `null`) for a field
      still overwrites the buffer as before
- [x] `npm run check` and the full Vitest suite pass

## Links

- `src/stores/market.svelte.ts` — `updateSymbol()`, `applyUpdate()`
- `src/services/bitunixWs.ts:930-970` — price channel handler
- `docs/backlog/bugs/BUG-0055-position-mark-price-always-zero.md`
