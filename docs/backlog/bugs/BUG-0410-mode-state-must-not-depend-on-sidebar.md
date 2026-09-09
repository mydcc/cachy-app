---
id: BUG-0410
title: Mode chip depends on PositionsSidebar being mounted
type: bug
status: in-progress
priority: P0
milestone: M4
editions: [community, pro, private]
area: trade-panel
data_class: A
adr: none
assignee: claude
depends_on: [BUG-0412]
---

# BUG-0410 — Mode chip depends on PositionsSidebar being mounted

## Symptom

`PositionsSidebar` only mounts behind `settingsState.effectiveShowSidebarActivity`
(`src/routes/+page.svelte:297,702`) — a trader who hides the sidebar loses
more than a panel: the mode chip's right half (`accountState.positionMode`)
never loads, shows "—" permanently, and no own position-mode write ever
reflects without a reload, although toast and broker confirm it.

## Reproduction

1. Live account, Bitunix. Settings → hide the sidebar activity panels.
2. Chip shows margin mode plus "—" for position mode.
3. Change position mode in Cachy, confirm twice: toast confirms, broker
   applies (verified in the broker app).
4. Chip still shows "—" until a page reload (with sidebar re-enabled).

## Cause

The only writer of `accountState.positionMode` outside paper mode is
`PositionsSidebar.fetchAccount` (mount, keys-change, sync-callback), and
`accountState.requestSync()` — the post-write refresh
`TradeService.changePositionMode` relies on — is a no-op without that
callback (`src/services/tradeService.ts:534-537`,
`src/components/inputs/ExchangeAccountControls.svelte`,
`src/components/shared/PositionsSidebar.svelte:586-621`). The chip only
reads; nothing it owns ever fetches. Hiding an informational panel must
never freeze an account control.

## Expected

- With the sidebar hidden, the chip still shows both modes and reflects an
  own write without a reload (own read, same silent-read contract as the
  margin side — no toast on failure).
- With the sidebar shown, no duplicate fetch storms: both readers are
  idempotent assignments of the same endpoint.
- Out of scope: venue push channel (none exists — BUG-0409), atomic
  snapshot of both halves (BUG-0409), asset/contract/multi modes
  (FEAT-0332, IDEA-0407, IDEA-0408).

## Notes

Groundwork uncommitted on `fix/margin-mode-display`:
`TradeService.fetchPositionMode` plus a chip-owned init effect
(`fetchPositionMode`, `AccountPort` entry, both adapters, conformance
table). It was built for BUG-0409's stale right half and satisfies this
item's read half; the refresh-after-write path still needs the decision
recorded here.

### Decision, Sep 2026 — the write reads itself back

The read half shipped with the mode-chip PR; what was left was every
*refresh* path still routing through `accountState.requestSync()`, which
fires a callback only `PositionsSidebar` registers. Three of them, all
silent no-ops with the sidebar hidden:

- `TradeService.changePositionMode` — the confirmed write. Now
  `await this.fetchPositionMode()` first, `requestSync()` after. The
  targeted read is the mechanism; the resync stays because the mode is
  reported on the account *and* on every position and the two views have
  to stop disagreeing.
- The chip's drift effect — drift it had already *detected* from an
  order push was then dropped. Reads for itself now.
- The chip's open-dialog re-read — the right half opened on a baseline
  from the last reload, so the dialog's own diff could propose a change
  the trader never made.

Depends on BUG-0412's ordering: this deliberately adds a second
concurrent reader of `/api/account`, which is only safe because a stale
response can no longer overwrite a fresher one.

Still out of scope here, and BUG-0409's: the read-back is taken *once*.
An exchange that has not yet settled answers with the old mode, and the
chip then shows the old mode — correctly reporting what the venue says,
but not yet what BUG-0409 asks for (bounded re-read until read matches
written).

## Links

- [`BUG-0409`](./BUG-0409-mode-chip-stale-after-change.md) — stale/wrong chip values, same control
- [`FEAT-0068`](../features/FEAT-0068-bitunix-account-settings.md) — the write path this reads back
