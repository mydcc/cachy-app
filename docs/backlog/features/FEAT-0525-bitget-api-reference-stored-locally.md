---
id: FEAT-0525
title: Store the complete Bitget API reference locally, mirroring the Bitunix coverage
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
---

# FEAT-0525 — Bitget API reference stored locally

## Problem

Bitunix venue behaviour can be answered from the local codebase and its stored
reference. Bitget behaviour cannot: questions like "does Bitget have a native
bulk-close endpoint?" (raised during BUG-0514) currently require re-deriving
the answer from the public docs and the scattered venue code every time. That
is slow and the answer is never pinned, so two readers can reach two different
conclusions about what the venue supports.

## Proposal

Fetch the complete Bitget API surface (public docs plus the existing venue code
under `src/` and `server/venues/`) and store it locally next to the Bitunix
coverage: endpoints with request/response shapes, authentication and signing
rules, rate limits, and a venue-parity table stating for each capability whether
Bitget supports it natively or Cachy emulates it client-side.

## Acceptance criteria

- [ ] Every Bitget endpoint Cachy calls is documented with path, method, auth
      scheme and rate limit, verified against the live docs at time of writing
- [ ] The parity table covers at least: single close, bulk close, order place,
      cancel, TP/SL attach, leverage/margin-mode set, position snapshot
- [ ] Each table row links to the implementing file (venue code or service)
- [ ] The document states its source date and the docs version it was checked
      against, so staleness is visible
- [ ] `npm run backlog:index` output committed in the same PR

## Out of scope

- Changing any venue behaviour. This item only pins down what the venue does.
- Bitunix documentation. That coverage already exists.
- Auto-syncing the reference. Freshness is manual until someone specs it.

## Open questions

- Where the reference lives: alongside the Bitunix coverage in `docs/bitunix-api/`
  (`00_common.md` through `10_change_log.md`, plus `README.md`,
  `QUICK_REFERENCE.md`, `INTEGRATION_STATUS.md`) — the implementing agent
  picks the exact spot (e.g. `docs/bitget-api/`) and links it here.

## Links

- BUG-0514 — the item whose Bitget bulk-close question motivated this
- BUG-0513 — close-all wiring, the first consumer of the parity answer
