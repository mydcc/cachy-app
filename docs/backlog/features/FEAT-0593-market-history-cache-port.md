---
id: FEAT-0593
title: Reach closed-bar history through a cache port that no-ops offline
type: feature
status: ready
priority: P2
milestone: none
editions: [community, pro, private]
area: market-data
data_class: C
adr: none
depends_on: []
agent_eligible: true
size: S
---

# FEAT-0593 — Reach closed-bar history through a cache port that no-ops offline

## Problem

The client has no seam through which a shared closed-bar cache could be read.
`src/services/api/marketData.ts` fetches from the venue directly,
`src/services/marketWatcher/historyFetcher.ts` pages through it, and
`src/services/storageService.ts` keeps its own IndexedDB copy. Any future cache
has to be reached from one of those, and ADR-0003 section 1 forbids core code
from importing `src/services/cloudService.ts` or the generated bindings —
not behind a flag, not in a try/catch.

That rule is currently prose. The two architecture tests that do exist cover
`services` → `stores` (`src/tests/architecture/exchange_boundary.test.ts`,
`boundary_allowlist.test.ts`); neither covers `services` → `spacetimedb`. So the
first person to add a cache reaches for `cloudService` and the boundary holds
only because nobody has tried to break it yet.

## Proposal

Define the port, implement the no-op, and add the missing architecture test.

`MarketHistoryCache` exposes `getClosedRange(symbol, tf, from, to)` and
`putClosedBars(symbol, tf, bars)`. A `NoOpCache` answers every read as empty and
discards every write, so the interface is exercisable before any server exists
and every caller is written against the port rather than against a vendor.

State reaches the cache through injection, following the existing
`setRequestTelemetrySink` pattern in `src/services/api/telemetry.ts` — not by
importing a store. A new service file that needed a store would land on
`servicesToStoresAllowlist`, which is burn-down-only and ratcheted by
`boundary_allowlist.test.ts`; that is the existing machinery working, not a new
rule.

## Acceptance criteria

- [ ] A `MarketHistoryCache` interface with `getClosedRange` and `putClosedBars`
      exists, and a `NoOpCache` implementing it.
- [ ] `NoOpCache` returns an empty range for every read and discards every
      write, and never throws.
- [ ] A test drives every consumer through `NoOpCache` and asserts the chart
      renders and EMA 200 computes — the offline path is proven, not assumed.
- [ ] A new architecture test asserts that no core file imports
      `cloudService`, `src/lib/spacetimedb`, or a SpacetimeDB binding. Core
      files at minimum: `api/marketData.ts`, `marketWatcher/historyFetcher.ts`,
      `marketAnalyst.ts`, `storageService.ts`.
- [ ] The architecture test detects both static value imports and dynamic
      `import()`, and is itself exercised against synthetic violating, type-only
      and clean sources — a matcher that silently stopped matching must fail the
      test rather than pass it vacuously, the way
      `boundary_allowlist.test.ts` does.
- [ ] No new path is added to `servicesToStoresAllowlist`.
- [ ] Consumers depend on the interface only; swapping `NoOpCache` for another
      implementation touches no caller.

## Out of scope

- Any SpacetimeDB implementation. That is FEAT-0592 and FEAT-0594.
- Changing what `marketData.ts` or `historyFetcher.ts` fetch. This item adds a
      seam and a test; behaviour is unchanged.
- Extending `RequestManager`'s in-memory TTL.
- Any UI.

## Open questions

None. The interface shape is fixed by ADR-0022 §4; the no-op needs no server.

## Links

- `docs/adr/0022-shared-hot-window-kline-cache.md` §4 — the port rule this
  implements.
- `docs/adr/0003-edition-boundary.md` §1 — the import ban that is currently
  unenforced.
- `src/services/api/telemetry.ts` — the injection-port pattern to follow.
- `src/tests/architecture/boundary_allowlist.test.ts` — the ratchet test and the
  self-testing-detector style to copy.
- `src/tests/architecture/exchange_boundary.test.ts` — the shape of a
  boundary assertion.
- `eslint.architecture.boundaries.js` — `servicesToStoresAllowlist`,
  burn-down-only.
- `docs/backlog/features/FEAT-0592-server-side-kline-ingestor.md`,
  [`FEAT-0594`](features/FEAT-0594-read-closed-bars-from-the-shared-cache.md) — the consumers this port exists for.
