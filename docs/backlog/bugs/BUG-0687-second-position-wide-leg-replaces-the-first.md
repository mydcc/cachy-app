---
id: BUG-0687
title: Setting the second leg of a position-wide plan deletes the first one
type: bug
status: in-progress
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
assignee: opencode
branch: fix/tpsl-position-plan-second-leg
---

# BUG-0687 — Setting the second leg of a position-wide plan deletes the first one

## Symptom

On Bitunix, a trader can keep only *one* of take-profit and stop-loss on a
position: setting one silently deletes the other.

Observed 2026-10-14 on LINKUSDT (10x cross, entry 12.2581, position 6.31):

1. Position-wide TP 12.73 is set — the card shows `TP 12.73`, the chart draws
   the TP line.
2. The trader opens *TP/SL setzen* to add a stop. The modal shows
   `TP 12.73 — bereits gesetzt` with an *Bearbeiten* link, plus an SL input
   and an *Anlegen* button.
3. After *Anlegen* the card shows `SL 11.89` and the TP line is gone — the
   take-profit was cancelled, not kept.
4. The same in reverse: with a stop set, adding a take-profit removes the stop
   (card then shows `TP 12.626`, SL gone).

The position is therefore protected by at most one leg, and the trader is not
told that the leg they set earlier was removed. A one-sided "protection" is
the dangerous half of a bracket, and it disappears without an error.

## Evidence

**Demonstrated** — reproduction described above, four screenshots from the
running app (Bitunix, LINKUSDT). No failing test exists yet; the fix carries
the first one.

**Derived** — the mechanism below follows from the code and the venue docs and
names the two pieces that disagree:

- `TpSlCreateModal.svelte` (`handleCreatePositionWide`) hides the input of a
  leg that is already covered (`tpCoveredByPositionPlan` / `slCoveredByPositionPlan`,
  `scopeGuess === "position"`) and sends the remaining leg through
  `activeExchange().trading.placePositionTpSl(...)` → `action: "place-position"`.
- `docs/bitunix-api/06_tp_sl.md` §Place Position TP/SL Order: *"Each position
  can only have one position TP/SL order."* A second `place_order` replaces the
  first; it is not a merge. The venue's endpoint for adding a leg to the
  existing plan is `POST /api/v1/futures/tpsl/position/modify_order`, which
  Cachy does not call — `src/routes/api/tpsl/+server.ts` `WRITE_PATHS` carries
  `cancel`, `modify`, `place` and `place-position` only.

`docs/bitunix-api/INTEGRATION_STATUS.md:96` already records the gap
(`position/modify_order` ❌, "not wired"), and FEAT-0070 deferred it to its
Out-of-scope section — the deferral assumed the single-leg edit path covered
the case, which it does not, because that path edits a leg of the row that
exists and cannot add the missing one.

Scope: the destructive flow needs `place-position`, which is a Bitunix action
(`tpSlService.placePositionTpSl` sends `exchange: "bitunix"` hard-coded). On
Bitget live the TP/SL verbs are refused locally before any request
(`SUPPORTS.tpSl: false`, `bitgetAdapter.ts`), so this defect cannot occur
there — that venue has a different, already-documented problem
(BUG-0503/BUG-0669). The paper simulator models the venue rule deliberately
(`paperExchange.ts` `placeTpSlPlan`: a second position-wide place replaces the
first), so Bitunix paper shows the same symptom as Bitunix live. Fixing the
caller fixes both, since both sit behind the same `placePositionTpSl` verb.

## Cause

Two correct decisions that do not know about each other:

1. The UI offers *Anlegen* for the missing leg because it knows one leg is set
   and assumes a place is additive.
2. The venue's position-wide endpoint is replace-only, and the endpoint that
   is additive (`position/modify_order`) was never integrated.

The app's own gate cannot see the defect either: the wire request is
well-formed, priced correctly, and passes every check — it is the *semantics*
of a second `place_order` that removes the first leg.

## Fix

Wire `position/modify_order` end-to-end and route the missing-leg case through
it, so adding the second leg *modifies* the existing plan with both prices
instead of replacing it:

- `src/routes/api/tpsl/+server.ts` — `WRITE_PATHS["modify-position"] =
  "/api/v1/futures/tpsl/position/modify_order"`.
- `src/types/apiSchemas.ts` — the documented request shape (`symbol`,
  `positionId`, `tpPrice`/`tpStopType`, `slPrice`/`slStopType`; at least one of
  `tpPrice`/`slPrice`), discriminated like the other write actions.
- `src/utils/exchange/venueQueries.ts` + `restSigningPlan.ts` — write body and
  body-signing shape for the new action.
- `src/services/trade/tpSlService.ts` — `modifyPositionTpSl(params)` next to
  `placePositionTpSl`; `kind: "modify"` so the kill switch still permits
  adjusting protection.
- `src/services/orderGate.ts` — `modify-position` in `mutatingActionOf` and
  the price fields.
- `src/components/shared/TpSlCreateModal.svelte` — with exactly one leg
  covered, send both the existing and the new price through
  `modifyPositionTpSl`; zero covered still places; both covered still only
  offers the edit links. The existing leg's stop type is carried over (default
  `MARK_PRICE`, matching the create default).
- `src/services/paperExchange.ts` — `modify-position` in `handleTpSl`; the
  simulator learns to add a leg to the same plan row (its `modifyTpSlPlan`
  skips a leg the group does not have).
- `src/services/exchange/bitgetAdapter.ts` — the new verb behind
  `SUPPORTS.tpSl` like its siblings, so live Bitget keeps refusing.
- `docs/bitunix-api/INTEGRATION_STATUS.md` — ❌ → ✅.
- `docs/backlog/features/FEAT-0070-bitunix-tpsl-placement.md` — its Out-of-scope
  note points here instead of leaving the gap implied.

Leave alone: `place-position` for a position with no plan at all (that is what
the endpoint is for), the single-leg `modify_order` edit path, and the partial
(`place`) section, which is additive by design and unaffected.

## Acceptance criteria

- [x] A failing test proves the defect before the fix: with one position-wide
      leg set, the create path sends `modify-position` carrying both prices
      (today it sends `place-position` with one).

      A test is the honest proof here because the replacement semantics belong
      to the venue: what the app can prove is the *call it makes*. The
      simulator's replace-on-second-place is the venue model that makes the
      observed data loss reproducible offline. The three new component tests
      were confirmed red with the modal reverted (`git stash push` on the
      source file, then re-run): all three failed on
      `expected "vi.fn()" to not be called at all` for `placePositionTpSl`.

- [x] With a position-wide TP set, adding an SL leaves both legs set; with an
      SL set, adding a TP leaves both set (paper simulator + component test).
- [x] A position with no leg covered still places through `place-position`.
- [x] `modify-position` is present in the route's write paths, the request
      schema (old/undocumented shapes rejected), and the signing plan.
- [x] The simulator supports `modify-position` and adds a missing leg to the
      same plan group instead of skipping it.
- [ ] Live-Bitunix behaviour confirmed once against a small position (manual
      check, human review before merge).
- [x] Bitget live and paper behaviour unchanged (verbs refused as before).

## Links

- [`FEAT-0070`](../features/FEAT-0070-bitunix-tpsl-placement.md) — the feature
  that built the create modal; deferred this endpoint explicitly
- [`BUG-0293`](BUG-0293-tpsl-modify-wire-format.md) — the single-leg modify
  wire shape this fix's sibling must imitate
- [`BUG-0292`](BUG-0292-tpsl-plans-never-typed-for-bitunix.md) — `scopeGuess`,
  the inference the create modal gates on
- [`docs/bitunix-api/06_tp_sl.md`](../../bitunix-api/06_tp_sl.md) — "each
  position can only have one position TP/SL order"; the modify endpoint's shape
