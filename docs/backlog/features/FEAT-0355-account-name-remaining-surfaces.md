---
id: FEAT-0355
title: Name the active account on the surfaces FEAT-0026 did not reach
type: feature
status: specced
priority: P2
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [FEAT-0026]
estimate: 2
size: S
target_date: 2026-12-21
start_date: 2026-11-24
---


# FEAT-0355 — Name the active account on the surfaces FEAT-0026 did not reach

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
| `ExchangeAccountControls.svelte` | `venueName` exists at `:79` but is used *only* inside blocked-reason strings, so it is invisible exactly when the control works |
| `ChartWindow.svelte.ts:53` | the standalone chart window has no ancestor chip; its title is the only place — `${symbol} · ${accountName}` |
| `+page.svelte:322` | the shell, next to `ConnectionStatus` — read-only |

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

## Acceptance criteria

- [ ] Every surface above names the account an action will use
- [ ] `ConfirmActionModal` callers pass the account as their **first** fact
- [ ] German and English strings
- [ ] No `$effect` added without a cleanup return

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
