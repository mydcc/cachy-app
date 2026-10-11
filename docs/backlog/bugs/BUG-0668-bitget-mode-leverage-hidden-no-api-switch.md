---
id: BUG-0668
title: Bitget mode and leverage chips are hidden, and UTA offers no API to switch them
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/bug-0668-bitget-mode-empty-account
shipped: unreleased
---

# BUG-0668 — Bitget mode and leverage chips are hidden, and UTA offers no API to switch them

## Symptom

With Bitget as the active venue, Cachy shows no leverage and no margin/position
mode — the `ExchangeAccountControls` component renders nothing at all, because
it is gated on `supports.accountSettings`, which is `false` for Bitget. A trader
cannot see the money-relevant settings of the account they are about to trade
on, and nothing tells them where those settings live instead.

Observed 2026-10-11: Bitget UTA account in `Advanced mode`, Isolated futures,
separate Long 20x / Short 20x leverage (screenshots) — in Cachy none of this is
visible, and with a zero balance no mode is knowable from any API response
either (`holdMode` arrives per position/order only).

## Evidence

**Demonstrated** for the hidden UI, **documented** for the missing writes.

- `src/components/inputs/ExchangeAccountControls.svelte:84` reads
  `activeExchange().supports.accountSettings`; `:662` renders nothing when it
  is false. `src/services/exchange/bitgetAdapter.ts` declares it `false`, and
  every refresh effect in the component additionally early-returns unless
  `exchange === "bitunix"` (`:197`, `:219`, `:260`, `:296`, `:366`).
- UTA has no set-position-mode, no set-margin-mode and no set-leverage
  endpoint — the API nav lists none (Classic had all three), and the vendor
  support article moves both position modes into *"the futures settings"*,
  i.e. app UI, not API (`docs/bitget-api/15_uta_writes.md:177-186`). The API
  only ever *reads* `holdMode` per position/order. Switching via API is
  therefore not a missing feature but impossible; it must never be built
  against a guessed wire format (BUG-0001).

## Cause

Two facts combining: the component treats "cannot switch" as "nothing to
show", and at zero balance there is additionally nothing to read — `holdMode`,
margin mode and leverage all arrive on positions/orders, and an empty account
has none (`src/stores/account.svelte.ts:616`).

## Fix

Render the chips for Bitget in read-only form: venue values where the store
has them (positions lane already feeds `positionMode` from `holdMode`),
honest unknown markers where it has none, tooltips pointing at the Bitget app
UI for switching. All writes keep refusing through the adapter — no new
signed path, no guessed body.

Leave alone: order placement, WS, the UTA write port (BUG-0597), account
switching (BUG-0667).

## Acceptance criteria

- [x] A test reproduces the defect and fails without the fix — Bitget active,
      mode/leverage controls absent (proven RED 2026-10-11: chips null)
- [x] With Bitget active and an empty account, leverage and mode chips render
      with unknown markers instead of vanishing, and name the Bitget app as
      the place to switch
- [x] With Bitget positions present, the mode chip shows the positions-lane
      `holdMode` (the store sets `positionMode` from it with no
      account-settings read); margin/leverage halves stay unknown-marked
      until a remote read exists — no guessed derivation
- [x] No Bitget write is attempted from these chips — change calls still
      refuse via the adapter (mode dialog never opens on read-only venues)
- [x] The test passes with the fix (59/59 component tests, 27/27 neighbors)
- [x] German and English strings for every touched label (reused existing
      `exchange.unsupported.accountSettings`, present in both locales)

## Out of scope

- Switching position mode, margin mode or leverage on Bitget via API —
  proven impossible above, not deferred
- Showing a locally stored "expected" mode as if it were venue truth
- Order entry, TP/SL, WebSocket private channels

## Review follow-ups (swarm, 2026-10-11)

Four read-only reviewers found no CRITICAL/HIGH issue and confirmed the
write-safety invariant. Three findings were fixed in the same PR before merge:

1. The leverage chip's localOnly path on Bitget is now pinned by a test — it
   was the only editor left for leverage there, and nothing covered the
   configuration that matters.
3. The mode chip no longer advertises a dialog it will never open
   (`aria-haspopup`/`aria-expanded` gone, `aria-disabled` set) and answers the
   tap with the venue message, because a `title` tooltip explains nothing on
   touch or keyboard.
4. `GeneralInputs`' `{#if !supported}` fallback leverage input is gone, along
   with its `.fee-input` CSS, the now-unused `leverage` prop and the parent's
   binding — a second editor for one field on a money-relevant panel. Two
   parent comments claimed the opposite and were corrected.

Finding 2 (the leverage chip shows the local planning value with no marker) is
open as a product decision and deliberately unchanged.

## Links

- FEAT-0068 — account settings panel this completes for Bitget display
- FEAT-0020 — account settings reads/writes
- BUG-0409 — mode-pair skew guard this reuses
- BUG-0596 — `holdMode` through the positions lane
- BUG-0597 — UTA write port (unchanged)
- BUG-0667 — account switching (sibling, untouched)
- `docs/bitget-api/15_uta_writes.md:177-186` — no-switch-endpoint evidence
