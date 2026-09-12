---
id: BUG-0441
title: A legacy alert whose target was crossed while the app was closed never fires
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
---

# BUG-0441 — A legacy alert whose target was crossed while the app was closed never fires

## Symptom

A trader arms "BTCUSDT reaches 65 000" while price is 64 000, closes the app, and
BTCUSDT moves to 66 000 overnight. On reopening, the alert is still listed as armed
and never fires — not on the first tick, not on any later one, not even though price
is well past the target. It stays armed forever unless the price comes back down and
crosses 65 000 again from below.

## Evidence

**Demonstrated** — against the committed `static/wasm` artefact, no rebuild needed:

```js
// initSync the committed static/wasm, then:
const e = new AlertEngineWasm();
e.set_alerts(JSON.stringify([{ id: 'a1', symbol: 'BTCUSDT',
  condition: { price_reached: '65000' }, active: true }]));
e.evaluate('BTCUSDT', '66000', 1);   // first tick after reload -> []
e.evaluate('BTCUSDT', '66100', 2);   // -> [] , and every tick after it
```

Found while measuring [`FEAT-0368`](../features/FEAT-0368-alert-engine-evaluation-batching.md);
the same probe is written up there under "Both halves of the proposal are unsafe as
written" as scenario 3.

## Cause

Two stores with different lifetimes disagree about what "last price" means.

`AlertsManager` persists definitions to `localStorage` under `cachy_alerts_v1`
(`src/stores/alerts.svelte.ts:62`), so an armed alert survives a reload. The
crossing baseline does not: `AlertEngine.last_prices`
(`technicals-wasm/src/alert_engine.rs:47`) lives in the WASM instance and starts
empty on every page load, and it is seeded *only* by `evaluate` itself
(same file, last line of `evaluate`).

So the first tick after a reload evaluates with `last_price_opt == None`. All three
conditions treat that as "cannot decide":

- `PriceCrossUp` / `PriceCrossDown` have no `else` branch at all — no baseline, no fire.
- `PriceReached` has one, but it is `current_price == target` — exact decimal equality
  against a live tick, which for a real price is never true.

That first tick then seeds the baseline *above* the target, so from the second tick
onwards there is no crossing left to detect. The alert is not delayed; it is lost.

The `== target` branch is what makes this a bug rather than a design choice: someone
already intended the cold-start case to fire and implemented a test that cannot hold.

## Fix

Give the no-baseline case a directional answer instead of an equality test. With no
baseline, a `PriceReached(t)` should fire when the first observed price is on or past
`t` in either direction; `PriceCrossUp(t)` / `PriceCrossDown(t)` are genuinely
directional and should fire when the first observed price is already at or beyond `t`
on the trigger side.

Touching `alert_engine.rs` means a WASM rebuild, so the PR has to ship a regenerated
`static/wasm` artefact and prove it regenerated — an unchanged `.d.ts` proves nothing
and the build is quiet on failure.

## Acceptance criteria

- [ ] A Rust unit test in `technicals-wasm` reproduces the defect and fails without the fix
- [ ] The same test passes with the fix
- [ ] An alert armed below a price that is already above it fires on the first tick after a cold start
- [ ] An already-warm baseline still fires only on a genuine crossing — no double fire, no fire on every tick while price sits past the target (the fire-once hysteresis must carry this)
- [ ] `static/wasm` is rebuilt in the same PR and the rebuild is demonstrated, not asserted

## Out of scope

- The per-tick evaluation cadence. That is [`FEAT-0368`](../features/FEAT-0368-alert-engine-evaluation-batching.md),
  measured and dropped.
- The `alert.active = false` fire-once hysteresis.
- The rule engine path. `FEAT-0387` rules warm up from real candle history and do not
  share this baseline.

## Links

- `technicals-wasm/src/alert_engine.rs` — `AlertEngine::evaluate`, `last_prices`
- `src/stores/alerts.svelte.ts:62` — `cachy_alerts_v1` persistence
- [`FEAT-0368`](../features/FEAT-0368-alert-engine-evaluation-batching.md) — where this was found
