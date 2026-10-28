---
id: FEAT-0378
title: Name the active account on the surfaces FEAT-0026 did not reach
type: feature
status: done
priority: P2
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [FEAT-0026]
shipped: PR #4403
estimate: 2
size: S
target_date: 2026-12-21
start_date: 2026-11-24
---


# FEAT-0378 — Name the active account on the surfaces FEAT-0026 did not reach

## Problem

[`FEAT-0026`](FEAT-0026-multi-account.md) requires the active account to be
"unmistakable wherever an order can be placed — not only in a header". It
shipped `ActiveAccountChip` on two surfaces: the order panel, and the
positions sidebar header, which stays visible when collapsed and therefore
covers flash close, cancel order and the TP/SL controls beneath it.

That is the majority of the exposure and not all of it. The surfaces below can
still send an order, or change a setting an order is checked against, without
naming the account they will use. Splitting them out rather than leaving the
parent criterion half-ticked keeps the gap visible instead of buried in a
checkbox that reads as done.

## Proposal

Place `ActiveAccountChip` — or the account name as a fact line, where a chip
does not fit — on:

| Surface | Why it is exposed |
|---|---|
| `ClosePositionModal.svelte` | opens from a chart window with no sidebar in view |
| `TpSlCreateModal.svelte` / `TpSlEditModal.svelte` | same |
| `AdjustMarginModal.svelte` | changes margin on a live position |
| `LeverageModal.svelte` / `MarginModeModal.svelte` | change what a position size is checked against |
| `AddToPositionModal.svelte` | adds to a live position, from a chart-window action |
| `ExchangeAccountControls.svelte` | its `venueName` is used only inside blocked-reason strings, so the venue is invisible exactly when the control works |
| `ExchangeAccountControls` leverage / mode confirmations | the final free-text dialog changes exchange settings and names no account |
| `closeAllFlow.ts` confirmation | bulk close states count and notional, not the account |
| `OpenOrdersList.handleCancel` | native `confirm()` names the order, not the account |
| `ChartWindow.svelte.ts` title accessor | the standalone chart window has no ancestor chip; its title is the only place — `${symbol} · ${accountName}` |
| `+page.svelte` title cluster | the shell, read-only (the account chip sits beside the app title; `ConnectionStatus` positions itself absolutely in the corner) |

Also: `PlaceOrderPanel.svelte:210-228` still confirms through free-text
`modalState.show()`. Extend `orderEntry.confirm.message` with an `{account}`
placeholder in both locales rather than migrating that dialog here — a dialog
rewrite on the primary order path does not belong in a diff about labelling.

**Do not build the chip into `src/components/layout/Header.svelte`.** Nothing
imports it; the real shell is `+page.svelte` plus `ConnectionStatus.svelte`.
Its FEAT-0012 paper-mode badge is already invisible for that reason.

**`PositionsSidebar` is mounted twice** (`+page.svelte:309`, `:718`), so
anything added for it must live inside the component, never be injected by the
parent.

## Resolution (2026-10-28)

**One derivation, reused everywhere.** `src/stores/settings/activeAccount.ts`
wraps `activeAccountFor(accounts, activeAccountId, apiProvider)` — the gate's
own resolver — and exposes `activeAccountLabel()` / `activeAccountVenueLabel()`.
The chip used to call `accounts.find(activeAccountId)`, which can name an
account the gate will not sign for: `resolveActiveId` keeps a stored id even
when it belongs to the other venue, and `activeAccountFor` repairs that by
falling back to the venue's first account. Chip, titles and confirmations now
label what will be signed. With no account left, the label is the display-cased
venue, not the lowercase provider slug.

- The six modals and `AddToPositionModal` show the chip in the header via
  `ModalFrame`'s `headerExtra`; `ModalFrameWindow` marks the header visible
  when a snippet is present.
- `ExchangeAccountControls` gains a third labelled column (account) in its own
  row, ahead of leverage and margin mode; its header comment now says three.
- `ChartWindow.title` is an overridden accessor: `${symbol} · ${account}`.
  `WindowFrame` reads it during render, so an account switch updates open
  windows. `serialize()` keeps the bare symbol so a restore cannot append the
  account a second time.
- Free-text confirmations that cannot host a chip prepend
  `common.accountLine`: place order, close-all, leverage, margin/position mode,
  and the native cancel prompt.
- `ConfirmActionModal` callers that move money lead with
  `orderGate.fields.account`; the two account-switch dialogs already lead with
  from/to and stay unchanged.
- Shell: the chip sits in the title cluster. `ConnectionStatus` positions
  itself absolutely in the panel corner, so a sibling would land elsewhere.

No `$effect` was added: the chip derives, the chart title is a getter.

## Acceptance criteria

- [x] Every surface above names the account an action will use
- [x] `ConfirmActionModal` callers pass the account as their **first** fact
- [x] German and English strings
- [x] No `$effect` added without a cleanup return (none added)

## Out of scope

- **Making the gate's account check a genuine second derivation.** FEAT-0026
  carries an account id through `DisplayedState`, `PassRecord` and
  `TransportContext`, but both roots are still `settingsState` — a second
  *field*, not a second *derivation*. Sourcing one root from what the chip
  actually rendered stays with the parent item, which records it as its own
  remaining work.
- **Migrating `PlaceOrderPanel`'s confirm to `ConfirmActionModal`.** Separate
  concern, separate diff.

## Links

- [`FEAT-0026`](FEAT-0026-multi-account.md) — the parent
- `src/components/shared/ActiveAccountChip.svelte` — the component to place
- [`FEAT-0024`](FEAT-0024-confirmation-policy.md) — `ConfirmActionModal`'s facts API
