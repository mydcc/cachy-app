---
id: FEAT-0023
title: Manage open positions without leaving Cachy
type: feature
status: ready
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [FEAT-0021]
estimate: 8
size: L
target_date: 2026-12-14
start_date: 2026-08-01
---


# FEAT-0023 — Manage open positions without leaving Cachy

## Problem

Cachy can open a position and then has little to say about it. Adjusting a stop,
taking partial profit or closing quickly all happen at the exchange.

## Proposal

This is an **epic**: five separate controls that share a subject (the open
position) but not an implementation. It was originally written as one `size: S`
item, which was wrong in a way worth recording — two of the five depend on
capabilities Cachy does not have yet, and bundling them meant either shipping
nothing or shipping a pull request that mixes a routine input with an
unverified exchange endpoint.

| Control | Where it is | Status |
|---|---|---|
| Modify position TP/SL after entry | [`FEAT-0254`](FEAT-0254-tpsl-input-range-slider-ux.md) | Done — slider and modes shipped |
| Partial close, by percentage or size | [`FEAT-0256`](FEAT-0256-partial-close-position.md) | Done |
| Flash close | [`FEAT-0330`](FEAT-0330-flash-close-wiring.md) | Done — FEAT-0024 shipped |
| Add to a position, average entry recomputed | [`FEAT-0334`](FEAT-0334-add-to-position.md) | Done — shipped in 1.6.0-beta.223 |
| Trailing stop and trailing TP/SL | [`FEAT-0335`](FEAT-0335-trailing-stop.md) | Blocked on a verified endpoint — see below |

**Flash close** shipped as [`FEAT-0330`](FEAT-0330-flash-close-wiring.md) once
[`FEAT-0024`](FEAT-0024-confirmation-policy.md) gave it a confirmation to sit
behind. It is the most dangerous control in the product — one click, full size,
market price — so its confirmation defaults to on and switching it off is a
deliberate act in settings. Waiting for the shared policy rather than building a
bespoke dialog for one button was the right call: the dialog it uses now serves
every other confirmable action too.

The bare `confirm()` this item once described in `PositionsList.svelte` is gone
— FEAT-0256 replaced it with `ClosePositionModal`, which asks the same question
and also answers *how much*.

**Add and reduce turned out not to be one control.** The question below asked
whether they belong together because they share the average-entry
recomputation. They do not share it: **a reduce does not move the average
entry** — closing part of a position realises PnL and leaves the remainder's
entry price where it was. The recomputation is add-only, and the reduce already
shipped as [`FEAT-0256`](FEAT-0256-partial-close-position.md). So the remaining
control is one item, [`FEAT-0334`](FEAT-0334-add-to-position.md), not two.

**Trailing stops** have no verified Bitunix endpoint in the current API doc
crawl — see [`INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md)
§Trade and [`FEAT-0070`](FEAT-0070-bitunix-tpsl-placement.md)'s own Out of
scope. Nothing can be built against it until the API is confirmed.

Every action is an order and passes the [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
gate.

## Follow-ups not done here

- **The dialog-closing invariant the TP/SL gate now leans on is unpinned.**
  An open `TpSlCreateModal` is gated by neither `tpSlStandalone` nor the
  derived. It closes on a venue switch only through an indirect chain: the
  provider setter → `appEffects` `providerChanged` → `accountSession.reset`
  → `accountEpoch.rotate` → the sidebar's epoch effect clears
  `tpSlCreatePositionId`. It holds today, but if that chain is ever decoupled,
  a trader with the form open switches venue and gets a submittable form the
  venue refuses — the failure this audit exists to prevent, reappearing. One
  test asserting the id is cleared across a provider change would close it.
  Not fixed in [#3710](https://github.com/mydcc/cachy-app/pull/3710) because it
  is a pre-existing dependency, not part of the gate being added.

## Acceptance criteria

This epic is done when each child item is done. It has no code of its own.

- [x] [`FEAT-0254`](FEAT-0254-tpsl-input-range-slider-ux.md) — modify TP/SL
- [x] [`FEAT-0256`](FEAT-0256-partial-close-position.md) — partial close, which is
      also the reduce this epic once listed alongside add
- [x] Flash close wired, behind [`FEAT-0024`](FEAT-0024-confirmation-policy.md) — [`FEAT-0330`](FEAT-0330-flash-close-wiring.md)
- [x] [`FEAT-0334`](FEAT-0334-add-to-position.md) — add to a position, average
      entry recomputed
- [ ] [`FEAT-0335`](FEAT-0335-trailing-stop.md) — trailing stop, which cannot
      start until a trailing endpoint is verified against the live API. **This
      epic stays open until then**, and that is the correct outcome: closing it
      early would record a capability the product does not have.
- [x] Unsupported actions absent per [`FEAT-0017`](FEAT-0017-exchange-capability-model.md) — audited 2026-09-28, see the capability audit below
- [ ] Each action verified live on each supported exchange

The two criteria that outlive every child — *unsupported actions are absent per
capabilities* and *verified live* — stay here rather than being copied into each
child, because they are properties of the finished set, not of any one control.

## Capability audit (FEAT-0017)

Audited 2026-09-28, the first time this criterion was checkable: FEAT-0017
shipped in 1.6.0-beta.135, so the four finished controls had something to be
measured against.

**One real gap, fixed here.** The modify-TP/SL control was offered on every
venue. `PositionsSidebar` passed `ontpSl={handleTpSl}` unconditionally, and
`PositionsList` rendered the button without a guard, calling through
`ontpSl?.(pos)` — so on a venue that answers `tpSlStandalone: false` (Bitget,
whose every TP/SL verb is refused on `supports.tpSl: false` and whose tpsl
route rejects every exchange but Bitunix) a trader got the form, filled it in,
and only then hit the refusal. That is the direction `bitgetCapabilities.ts`
warns about when it declares a venue feature Cachy cannot yet spell: a
control that fails *after* the trader committed. The add-to-position control
two dozen lines below already followed the rule, with the rule written next to
it. Both now do, and both are pinned by tests.

**The other three were already correct, and it is worth saying how.**

- *Close, partial close, flash close* — no capability flag exists for closing,
  and none is missing: both venues wire `closePosition` and
  `flashClosePosition`, so there is nothing to declare. A flag that is
  uniformly true guards nothing.
- *Add to position* — gated on `capabilities.addToPosition` and absent on a
  venue that cannot scale in. Was untested until now; it is now pinned beside
  the TP/SL control, since a guard that covers only the newer control is how
  this gap opened.
- *Trailing stop* — `trailingStop` is `false` on both venues because Cachy has
  no wire format for it at all, and correspondingly no control exists anywhere.
  The criterion holds vacuously, and correctly so: the honest version of
  "absent" for an unbuilt feature is "not there".

**A second gap on a neighbouring surface, found while fixing the first.** The
TP/SL *manager* tab is the same rule in a different place: it listed, edited
and cancelled plans regardless of what the venue takes. On a venue that takes
none, its list read is deliberately non-throwing — `fetchTpSlOrders` returns
`[]` rather than raising, on purpose, so an unsupported venue cannot open a
dialog — so the tab would not have errored. It would have sat permanently
empty and never once said why. It is now absent on such a venue, on the same
flag. Reading plans is not a lesser capability than writing them: a venue that
cannot be given a stop has none to list.

It sits on the dashboard rather than on this epic's position row, so it is
recorded here rather than counted as one of the four controls.

**Both gates had to be reactive, which the first version was not.** A gate
written as a plain `const` from a capability keeps the value it had at mount,
and the sidebar is not remounted when the account or venue changes — so a
Bitunix → Bitget switch with the tab open would have left the tab there, which
is the failure this closes. Two tests now switch venue on a mounted component
rather than before mounting; the test harness reads its capabilities from a
`$state` module for exactly this reason, since a plain mocked object severs the
dependency the derived would have. A third test pins the consequence: a tab the
venue does not have must not stay active, or the content chain — which has no
`{:else}` — renders an empty panel with nothing highlighted.

## Out of scope

- **Anything a child item owns.** Add code to the child, not here.

## Open questions

- ~~**Does add-to-position deserve its own item or does it belong with
  reduce?**~~ Answered 2026-09-02: they do not share the average-entry
  recomputation, because a reduce does not move the average entry. Reduce is
  [`FEAT-0256`](FEAT-0256-partial-close-position.md), already shipped; add is
  [`FEAT-0334`](FEAT-0334-add-to-position.md). See the Proposal.

## Links

- [`FEAT-0254`](FEAT-0254-tpsl-input-range-slider-ux.md) — TP/SL input, done
- [`FEAT-0256`](FEAT-0256-partial-close-position.md) — partial close, done
- [`FEAT-0334`](FEAT-0334-add-to-position.md) — add to a position
- [`FEAT-0335`](FEAT-0335-trailing-stop.md) — trailing stop, blocked on the API
- [`FEAT-0024`](FEAT-0024-confirmation-policy.md) — confirmation policy, blocks flash close
- [`FEAT-0017`](FEAT-0017-exchange-capability-model.md) — capability model
- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) — the gate every action passes
- `src/services/tradeService.ts` — `flashClosePosition`, `closePosition`
