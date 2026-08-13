---
id: BUG-0063
title: Closing a position still 500s after BUG-0062 on a ONE_WAY/Isolated account
type: bug
status: done
priority: P0
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [BUG-0062]
estimate: 1
size: XS
target_date: 2026-08-25
---

# BUG-0063 — Closing a position still 500s after BUG-0062 on a ONE_WAY/Isolated account

## Symptom

Reported live, immediately after BUG-0062 (HEDGE-mode `tradeSide`/
`positionId`) merged: clicking "Close" on an open position still fails.
Browser console still shows `POST https://dev.cachy.app/api/orders 500
(Internal Server Error)`, and the UI now additionally surfaces the
exchange's real rejection reason (visible only because BUG-0062 also fixed
`handleClosePosition()`'s swallowed-error bug): **"must not be null"**. The
user confirmed the position under test was in **Isolated margin mode /
ONE_WAY position mode** — not HEDGE.

## Evidence

**Demonstrated** — live 500 + "must not be null", confirmed against a
ONE_WAY account, plus a re-read of the exact API contract.

BUG-0062 read `docs/bitunix-api/07_trade.md:583`'s description text ("Nur
im Hedge-Modus erforderlich") and concluded `tradeSide`/`positionId` could
be omitted outside HEDGE mode — so `buildCloseOrderFields()`
(`src/services/tradeService.ts`) only sent them when
`position.positionMode === "hedge"`, falling back to the original
inverted-`side`-only shape otherwise. That fallback is the exact shape this
code sent before BUG-0062 too — closing was never confirmed working in that
shape, only orders (a different endpoint/flow) were.

Re-reading the same table more carefully: the **Required** column for
`tradeSide` is `true` (`docs/bitunix-api/07_trade.md:32` and `:583`, both
`place_order` and `batch_order`), with no mode qualifier on the column
itself — only the description text carries the "Hedge-Modus" caveat, and
that caveat describes when the *value* matters for disambiguation, not
whether the *field* may be absent. `positionId`'s row says "Erforderlich,
wenn `tradeSide` = `CLOSE`" — again no Hedge-only qualifier. The documented
request example pairs `side=BUY` with `tradeSide=CLOSE` for "Close Long",
i.e. `side` matches the position's own side, not inverted. Bitunix's
backend rejecting a `place_order` missing these fields with a validation
message ("must not be null") on a confirmed ONE_WAY account is consistent
with the field being unconditionally required, contradicting only the
description text BUG-0062 relied on.

## Cause

`buildCloseOrderFields()` only added `tradeSide`/`positionId` (and switched
`side` to match the position instead of inverting it) when
`positionMode === "hedge"`. Bitunix requires both fields for every close,
regardless of position mode, so the ONE_WAY/unknown-mode branch kept
sending a payload Bitunix rejects.

## Fix

`buildCloseOrderFields()` (`src/services/tradeService.ts`) now always
returns `tradeSide: "CLOSE"` and `positionId` (when known), with `side`
matching the position's own side (BUY closes a long, SELL closes a short)
— the `positionMode` branch is removed entirely. `positionMode` stays on
`OMSPosition` for display purposes only (Account Summary "Mode:
HEDGE/ONE_WAY").

## Acceptance criteria

- [x] `closePosition()`/`flashClosePosition()` send `tradeSide: "CLOSE"`
      and `positionId` (when known) for both HEDGE and ONE_WAY/unknown-mode
      positions
- [x] `side` matches the position (not inverted) in both cases
- [x] `npm run check` and the full Vitest suite pass (updated
      `tradeService_hedgeClose.test.ts`,
      `tradeService_flashClose_hardening.test.ts`, `tradeService_safety.test.ts`,
      `src/tests/flash-close.test.ts`, `src/tests/flash_close_race_repro.test.ts`
      — all previously asserted the now-corrected inverted-`side`-only shape)

## Links

- `src/services/tradeService.ts` — `buildCloseOrderFields()`
- `docs/bitunix-api/07_trade.md:32,583-584` ("Place Order" / "Batch Order")
- `docs/backlog/bugs/BUG-0062-hedge-mode-close-position-fails.md`
