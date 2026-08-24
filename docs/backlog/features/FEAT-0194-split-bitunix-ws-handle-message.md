---
id: FEAT-0194
title: "Split bitunixWs.ts handleMessage into parsing, validation and channel dispatch"
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: services
data_class: none
adr: none
depends_on: [BUG-0182, BUG-0183, BUG-0184, FEAT-0193]
estimate: 3
size: M
target_date: 2026-09-14
start_date: 2026-08-14
---


# FEAT-0194 — Split `bitunixWs.ts` `handleMessage` into parsing, validation and channel dispatch

Sub-item 2 of 5 under [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md).
Read that item's "Rules that apply to every sub-item" first.

> **Sequenced after [`FEAT-0193`](FEAT-0193-split-market-watcher.md), not just
> ordered.** `depends_on` includes `FEAT-0193` so `scripts/jules/dispatch-backlog.mjs`
> will not dispatch this item until FEAT-0193's status is `done` on `develop` —
> i.e. until its PR has been reviewed and merged, not merely opened. Two
> service-layer splits landing from independent agent sessions at the same
> time is exactly the kind of parallel-refactor collision the parent epic
> waited for the decimal migration to avoid; running them one at a time avoids
> it here too.

## Problem

`BitunixWebSocketService.handleMessage` in `src/services/bitunixWs.ts` is
**577 lines** (starting around line 899) — by a wide margin the largest single
method in the codebase, and the only one in `bitunixWs.ts` over 200 lines. The
file as a whole is 1897 lines.

`handleMessage` runs four distinct phases in sequence, in one function body:

1. **Fast-path parsing** for high-frequency channels (price, ticker, depth),
   with its own `try`/`catch` and channel-specific Zod schemas — roughly the
   first 280 lines. It exists to skip full validation on hot messages.
2. **Full Zod validation** with the circuit-breaker logic that distinguishes
   critical structural failures from tolerable field mismatches.
3. **Control frames** — `login`, `ping`, `pong` (including the latency
   measurement on `pong`).
4. **Channel dispatch** — a long `if`/`else if` chain over `price`, `ticker`,
   `depth_book5`, `trade`, `position`, … each mapping a payload onto a store
   update.

## Proposal

Extract phases 1, 2 and 4 so that `handleMessage` becomes a short orchestrator.
The split is deliberately chosen to match the three concerns that
[`FEAT-0016`](FEAT-0016-exchange-adapter-interface.md) will later formalise
as the exchange adapter interface — **transport, parsing, dispatch** — so this
refactor is a down payment on M2 rather than throwaway motion. Suggested shape:

- `src/services/bitunixWs/messageParser.ts` — fast path + Zod validation +
  circuit-breaker decision (phases 1 and 2). Input: raw frame. Output: a
  discriminated, validated message or a "reject" outcome.
- `src/services/bitunixWs/channelDispatch.ts` — phase 4, the per-channel
  payload-to-store mapping.
- `bitunixWs.ts` keeps transport: socket lifecycle, reconnect, auth, control
  frames, throttling.

**State the mapping onto FEAT-0016's transport/parsing/dispatch concerns
explicitly in the PR description** — that is an acceptance criterion, not a
nicety.

Behaviour-preserving. `refactor:` commits only. In particular the fast path
must stay a fast path: do not "simplify" it into the general validation route,
that would be a performance change.

### Coverage

Six test files exist and are the baseline: `bitunixWs.test.ts`,
`bitunixWs.leak.test.ts`, `bitunixWs_leak.test.ts`,
`bitunixWs_fastpath.test.ts`, `bitunixWs_force_reconnect.test.ts`,
`bitunixWs_hardening.test.ts`. They must keep passing **unchanged** — if a
test needs editing to accommodate the split, the public surface moved, which
this item does not allow. Say so in the PR instead of adjusting the test.
`bitunixWs_fastpath.test.ts` in particular pins phase 1's behaviour; treat it
as the contract for the extracted parser.

## Acceptance criteria

- [ ] `handleMessage` is under 100 lines and only orchestrates
- [ ] No method in `bitunixWs.ts` exceeds 200 lines
- [ ] Parsing/validation and channel dispatch each live in their own module
- [ ] The PR description states how the extracted units map onto
      [`FEAT-0016`](FEAT-0016-exchange-adapter-interface.md)'s transport,
      parsing and dispatch concerns
- [ ] The six existing `bitunixWs*` test files pass **without being modified**
- [ ] `npm run check` passes with 0 errors
- [ ] `npm test` passes
- [ ] `bitunixWs.ts`'s exported API is unchanged (callers untouched), or each
      change is listed and justified here on completion

## Out of scope

- Defining the adapter interface itself ([`FEAT-0016`](FEAT-0016-exchange-adapter-interface.md)) —
  this item shapes the units it will later wrap, nothing more.
- Any change to reconnect strategy, throttling, or the circuit-breaker
  thresholds.
- `bitgetWs.ts` — a symmetric split there is a separate item if wanted.
- Touching any of the other four modules in [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md).

## Links

- [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md) — parent epic and shared rules
- [`FEAT-0016`](FEAT-0016-exchange-adapter-interface.md) — the interface this split anticipates
- [`docs/adr/0003-edition-boundary.md`](../../adr/0003-edition-boundary.md)

## What shipped

Shipped in 1.6.0-beta.20.
