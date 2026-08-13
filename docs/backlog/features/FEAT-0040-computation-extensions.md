---
id: FEAT-0040
title: Run user-written indicators in an isolated worker
type: feature
status: idea
priority: P2
milestone: M6
editions: [community, pro, private]
area: extensions
data_class: none
adr: ADR-0005
depends_on: [FEAT-0039, FEAT-0011]
---

# FEAT-0040 — Run user-written indicators in an isolated worker

## Problem

The extension request that carries real value is custom **logic**: an
indicator the user wrote, an alert condition Cachy does not ship, a scoring
rule for their own strategy. That is code, and code from a third party running
in a browser holding exchange API keys is the exact hazard
[ADR-0005](../../adr/0005-extension-model.md) exists to contain.

## Proposal

**Tier 2 of ADR-0005: computation with no ambient authority.** An extension of
this tier is a pure function — klines and parameters in, numeric series out.

It runs in a **Web Worker constructed without the capabilities it does not
need**: no `localStorage`, no `fetch`, no DOM, no knowledge of the user. Input
is passed in as a message; output comes back as a message. There is no route
from inside to a credential, because none is reachable rather than because the
documentation asks nicely.

The worst a hostile extension can do is return wrong numbers or burn CPU. Both
are bounded — the first by provenance marking below, the second by a timeout
and a kill.

**Provenance marking is part of this item, not a follow-up.** Every value an
extension produces is tagged as extension-sourced. That tag is what lets the
UI show where a number came from, and what lets
[`FEAT-0011`](FEAT-0011-preflight-order-verification.md)'s gate decline to
size a position off an unverified computation without the user knowing. A
community indicator feeding a position size is a money path; it should look
like one.

A "trading bot" belongs here too, and the shape is the same: it may **propose**
an order, and the proposal goes through the same gate, the same risk limits
and the same kill switch as a human click. It is a client of M1, not an
exception to it.

## Acceptance criteria

- [ ] An extension runs in a worker with no `fetch`, no `localStorage` and no
      DOM — asserted by a test extension that tries each and fails
- [ ] An extension that never returns is killed by a timeout without taking
      the UI with it
- [ ] An extension that throws is reported and disabled, not silently retried
- [ ] Results are tagged with their source, and the tag survives into
      everything downstream that consumes them
- [ ] An order derived from extension output cannot bypass
      [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)'s gate —
      asserted by a test that tries
- [ ] Extensions bind to a declared, versioned API and cannot import from
      `src/services/` or `src/stores/` — asserted by a lint rule or an import
      test
- [ ] An extension crash or removal leaves core indicators working
- [ ] CPU cost per extension is measurable, so a slow one can be identified

## Out of scope

- UI panels, network access, custom exchange adapters — Tier 3, deliberately
  not built until this tier has been used in anger.
- Distribution, licensing, a marketplace — [`FEAT-0032`](FEAT-0032-plugin-contract.md).

## Open questions

- **Language and format.** Plain JS in a worker is the obvious start.
  WASM would be stronger isolation and matches where the indicator engine is
  going ([`FEAT-0027`](FEAT-0027-alert-engine.md) is Rust→WASM), but it is a
  far higher bar for someone writing a personal indicator. This trade needs
  deciding before implementation.
- **How does an extension declare its inputs** — which symbols, which
  timeframe, how much history — without being able to request unbounded data?
- **Debuggability.** Worker isolation makes authoring harder; without a decent
  error path this tier will go unused.

## Links

- [`docs/adr/0005-extension-model.md`](../../adr/0005-extension-model.md)
- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) — the gate that
  makes a bot proposal safe
- `src/workers/technicals.worker.ts` — the existing worker pattern
