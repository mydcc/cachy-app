---
id: BUG-0441
title: A legacy alert whose target was crossed while the app was closed never fires
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
branch: worktree-alert-engine-batching-dc1192
start_date: 2026-09-12
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

**The first draft of this section was wrong, and the correction is the whole
solution.** It proposed giving the no-baseline case a directional answer — fire when
the first observed price is already at or past the target. That contradicts
`FEAT-0390`'s sharpest requirement, which the rule evaluator enforces under the name
`rises_above_does_not_fire_when_the_price_was_already_above`: "rises above 60000" must
*not* fire on a price that was already above 60000 when the alarm was armed. A
first-tick comparison cannot tell that case apart from a genuine crossing, so it would
have replaced a missed alert with a false one.

The information the engine is missing is not "which side was the price on when the
alarm was armed". It is **history** — and the rule engine, which never had this bug,
shows why: it derives "the previous value" from persisted candle closes rather than
from an in-memory tick stream. History answers both questions at once:

- a price that *crossed* while the app was closed leaves a pair of closes straddling
  the target, and fires;
- a price that was *always* past the target leaves no such pair, and does not fire.

So: **replay the recent closed candles through the unchanged engine at startup**,
oldest first, before any live tick reaches it. No Rust change, no WASM rebuild, no new
condition kind, and the existing fire-once hysteresis still bounds each alarm to one
firing.

Left alone:

- The per-tick evaluation cadence — that is [`FEAT-0368`](../features/FEAT-0368-alert-engine-evaluation-batching.md),
  measured and dropped.
- `technicals-wasm/` entirely. The engine's crossing logic was never wrong; it was
  being started without the history it needed.
- The rule engine path. A covered alert is not in the legacy engine at all, so the
  replay cannot reach it.

## Acceptance criteria

- [x] A test reproduces the defect and fails without the fix — `alerts_engineWiring.test.ts`,
      "fires the alert, because the crossing is in the candle history": verified RED
      with the replay call removed (1 failed / 5 passed), GREEN with it (6 passed)
- [x] The test passes with the fix
- [x] An alert armed below a level the price crossed while the app was closed fires at
      startup, anchored to the candle that crossed rather than to startup time
- [x] A price that was already past the level the whole time still does not fire —
      `FEAT-0390`'s requirement is preserved, not traded away
- [x] No double fire: a live tick crossing again after the replay leaves exactly one
      fired alert (hysteresis), and an alert the rule engine covers is excluded from
      the replay entirely
- [x] Missing history, a history read that throws, and a corrupt candle mid-series all
      leave startup reaching `ready` with no guessed baseline
- [x] ~~`static/wasm` is rebuilt in the same PR~~ — not applicable: the fix is
      TypeScript only, which is why it is also free of the artefact-drift hazard

## Fixed (2026-09-12)

`src/services/alertEngine/replayClosedCandles.ts` — a pure function over injected
readers, so its 13 tests need neither the market store nor wasm. `initAlertEngine`
calls it immediately after `syncEngine(covered)`.

**Two details carry the correctness.**

*Closes only.* A candle whose high crossed the target but whose close came back does
not fire. That matches the rule evaluator and the behaviour `FEAT-0387` documented to
traders ("no firing for a mid-candle touch that recovers"); replaying highs and lows
would make the legacy fallback *more* sensitive than the engine that replaced it.

*Ordering is a correctness requirement, not a preference.* The replay has to be the
engine's first evaluation for a symbol. If a live tick seeds the baseline first, the
replay's oldest close is compared against the live price — an arbitrary jump that can
straddle a target in either direction and fire for nothing. The dynamic
`import("./ruleLoopWiring")` therefore moved *above* `await alertEngine.ensureLoaded()`,
so everything from that await's continuation through the replay runs in one synchronous
stretch no WebSocket callback can interleave. `evaluate` early-returns while the
instance is null, so nothing can have been evaluated before it either.

Two candles are required before anything is replayed. A single close cannot express a
crossing, and a lone stale baseline paired with the next live tick spans an unknown gap
— the same arbitrary jump, arriving through the front door.

## Links

- `src/services/alertEngine/replayClosedCandles.ts` — the fix
- `src/stores/alerts.svelte.ts` — `initAlertEngine`, the ordering constraint
- `technicals-wasm/src/alert_engine.rs` — `AlertEngine::evaluate`, `last_prices` (unchanged)
- `technicals-wasm/src/rule/evaluate.rs` — `rises_above_does_not_fire_when_the_price_was_already_above`,
  the semantics this fix had to preserve
- `src/stores/alerts.svelte.ts:62` — `cachy_alerts_v1` persistence
- [`FEAT-0368`](../features/FEAT-0368-alert-engine-evaluation-batching.md) — where this was found
