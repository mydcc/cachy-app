---
id: FEAT-0461
title: Generalize the journal history sync to Bitget and further venues
type: feature
status: specced
priority: P2
milestone: none
editions: [pro, private]
area: exchange
data_class: A
adr: none
depends_on: []
size: L
---

# FEAT-0461 — Generalize the journal history sync to Bitget and further venues

## Problem

The journal's Sync button only ever talks to Bitunix. The client routine
`syncService.syncBitunixPositions()` (`src/services/syncService.ts:174`) reads
Bitunix credentials hard-coded (`keysForActiveAccount(..., "bitunix")`, line
177) and calls three Bitunix-only proxy endpoints — `/api/sync/positions-history`,
`/api/sync/positions-pending`, `/api/sync/orders` (`syncService.ts:233-237`).

The server side matches: `src/routes/api/sync/positions-history/+server.ts`
imports `generateBitunixSignature` and `fetchBitunixHistoryPositions` directly.
Unlike orders/account/balance/klines, which resolve a venue module since
[`FEAT-0228`](FEAT-0228-venue-modules-in-proxy-routes.md), the `/api/sync/*`
family kept its Bitunix branch and was left out of that refactor.

The visible effect: the button is labelled "Sync Bitunix" whatever the active
venue is (`settingsState.apiProvider`, `src/stores/settings.svelte.ts:304`). A
user whose active account is Bitget gets a Bitunix-labelled action that cannot
import their trades, and there is no seam to add another venue without editing
the client service and every sync route.

## Proposal

Give the history sync the same per-venue shape the proxy routes already have:

- A venue module per broker that owns the three reads (closed positions, open
  positions, orders), resolves credentials and signs requests. Bitunix is the
  existing branch moved behind the seam; Bitget is the first new module.
- `syncService` dispatches on the active venue instead of a hard-coded Bitunix
  function, keeping the current lock, account-epoch guard, history batching and
  partial-failure tolerance exactly as they are.
- Normalization to the journal entry shape (`accountId` + `provider` matching,
  `belongsToSyncedAccount`) moves with the venue, so no broker-specific field
  handling leaks into `JournalContent`/`JournalFilters`.
- The Sync button label is derived from the active venue, with a generic
  fallback ("Sync history") for a venue without a sync module — the button is
  never hidden (product decision, 2026-09-13).

## Acceptance criteria

- [ ] With a Bitget account active, Sync imports closed positions, open
      positions and orders into the journal, stamped with that account's
      `accountId`/`provider`, and leaves Bitunix entries untouched.
- [ ] With a Bitunix account active, behaviour is unchanged — history batching,
      partial-sync tolerance and the account-epoch guard are the same, proven by
      the existing `syncService` tests passing untouched.
- [ ] The `/api/sync/*` routes resolve a venue module instead of calling Bitunix
      signing directly, mirroring FEAT-0228's route contract.
- [ ] The Sync button label reflects the active venue and falls back to a
      generic label for an unknown venue; it is still shown for every venue.
- [ ] Unit tests cover normalization for both Bitunix and Bitget, including a
      Bitget error response that must not read as "no orders"
      (see [`BUG-0268`](../bugs/BUG-0268-bitget-history-silent-empty.md)).

## Out of scope

- Venues beyond Bitget. The adapter seam is the deliverable; each further venue
  is its own item.
- Real-time/streaming position sync — this stays an on-demand REST sync.
- Anything touching the Local-First boundary or how API keys are stored. Keys
  stay per-device in Class A storage.

## Open questions

- Where the sync venue modules live on the server: extend the existing venue
  registry from FEAT-0228 with the three sync reads, or add a dedicated
  `sync` venue module? Decide before this can move to `ready`.
- Venue source for dispatch: `settingsState.apiProvider`, or the active
  account's `provider` (accounts are now per-venue, so the two can disagree)?
- Does the adapter contract need its own ADR, or does it fall under the
  existing [`ADR-0007`](../../adr/0007-exchange-adapter-boundary.md) boundary?

## Links

- `src/services/syncService.ts` — `syncBitunixPositions` (line 174)
- `src/services/app.ts` — `syncBitunixHistory` (line 459)
- `src/routes/api/sync/positions-history/+server.ts` — Bitunix-only signing
- `src/stores/settings.svelte.ts` — `apiProvider` (line 304), `accounts`
- [`FEAT-0228`](FEAT-0228-venue-modules-in-proxy-routes.md) — the per-venue route pattern to mirror
- [`FEAT-0016`](FEAT-0016-exchange-adapter-interface.md) — client-side exchange adapter
- [`BUG-0268`](../bugs/BUG-0268-bitget-history-silent-empty.md) — Bitget history errors must stay distinguishable from "no orders"
- [`ADR-0007`](../../adr/0007-exchange-adapter-boundary.md) — exchange adapter boundary
