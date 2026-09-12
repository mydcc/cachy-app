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

So: **replay the recent closed candles through the unchanged engine**, oldest first,
before any live tick reaches it. No Rust change, no WASM rebuild, no new condition
kind, and the existing fire-once hysteresis still bounds each alarm to one firing.

The replay cannot be a single startup pass: the market store is empty at
`initAlertEngine()` and klines arrive later, as the chart/watchlist subscribes. It
therefore runs at the first point history exists — at startup if already present, the
moment a symbol's klines land, or at the latest immediately before that symbol's first
live evaluation. See "Fixed" below.

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
- [x] An alert armed below a level the price crossed while the app was closed fires when
      its history is available — at startup, when the series' klines land, or at the
      latest before the symbol's first live evaluation — anchored to the candle that
      crossed rather than to any live tick — **bounded**: only within the replay window
      (see "Known limitation" below), not for every possible crossing regardless of age
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
readers, so its tests need neither the market store nor wasm.
`src/services/alertEngine/legacyReplayCoordinator.ts` — the small state machine that
decides when it runs and enforces the ordering rule.

**History is read when it exists, not once at startup (review follow-up).** The market
store is empty at `initAlertEngine()`; klines arrive later as the chart/watchlist
subscribes. A single startup pass therefore usually replayed nothing and let the first
live tick consume the crossing. The coordinator attempts the replay in three places, in
order of preference: at startup, the moment a symbol's klines land
(`noteLegacyReplaySeriesObserved`, wired into `marketState.applySymbolKlines`), and
immediately before a symbol's first live evaluation (`replayBeforeLegacyEvaluation`,
wired into `applyUpdate`). A symbol that replays or throws is `decided` and never
replayed again; only "no history yet" stays pending. There is no deferral — a symbol
whose history never arrives degrades to the pre-fix behaviour rather than to an alert
that never evaluates.

**Every available timeframe is considered, not a fixed `1m`/`5m`/`15m` list (review
follow-up).** `readAvailableKlineTimeframes` returns the store's own series for the
symbol, finest first, so a symbol charted at `1h` is replayed from its `1h` history
instead of being skipped because it holds none of the three probed defaults.

**One malformed candle no longer costs the whole series (review follow-up).**
`readClosedCandles` drops an unreadable candle instead of throwing and returning `[]`,
which previously withheld every rule on the symbol.

**A refused evaluation is reported (review follow-up).** `alertEngine.evaluate` now
returns whether the engine actually ran, so the replay's `failed` count reflects a WASM
refusal instead of swallowing it.

**Two details carry the correctness.**

*Closes only.* A candle whose high crossed the target but whose close came back does
not fire. That matches the rule evaluator and the behaviour `FEAT-0387` documented to
traders ("no firing for a mid-candle touch that recovers"); replaying highs and lows
would make the legacy fallback *more* sensitive than the engine that replaced it.

*Ordering is a correctness requirement, not a preference.* The replay has to be the
engine's first evaluation for a symbol. If a live tick seeds the baseline first, the
replay's oldest close is compared against the live price — an arbitrary jump that can
straddle a target in either direction and fire for nothing. The coordinator's
`decided` set closes that window: the pre-evaluation hook replays from whatever history
is present and then locks the symbol, so no later replay can run against a live
baseline. The dynamic `import("./ruleLoopWiring")` also moved *above*
`await alertEngine.ensureLoaded()`, so the startup attempt runs before any WebSocket
callback can interleave. `evaluate` early-returns while the instance is null, so
nothing can have been evaluated before it either.

Two candles are required before anything is replayed. A single close cannot express a
crossing, and a lone stale baseline paired with the next live tick spans an unknown gap
— the same arbitrary jump, arriving through the front door.

**A second `initAlertEngine()` call cannot re-replay.** `ensureLoaded()` caches the WASM
instance across calls, so a second call — none exists in production today, but nothing
stopped one — would have replayed into an engine that already holds a live baseline for
some symbols: the exact arbitrary-jump false fire this whole fix exists to prevent. The
coordinator's `decided` set makes the replay step a no-op on any call after the first.
RED proven first (a still-armed alert flipped to fired by a second, unrelated window)
then GREEN, in `alerts_engineWiring.test.ts`.

## Known limitation (found in review, 2026-09-12)

The window search stops at the **first available timeframe** that has two usable closes
— it does not check whether that timeframe's window actually straddles the target, nor
does it fall through to a coarser series when it doesn't. At `1m` the effective window
is `REPLAY_MAX_CANDLES` (240) candles = 4 hours.

Concretely: a trader charting `1m` who arms an alert Friday evening and whose target is
crossed Saturday, with the app reopened Monday, gets a `1m` window that is entirely
*past* the target (no straddling pair) — so no fire — even though a coarser series that
was also loaded would have straddled it.

A second residual: the replay is not deferred. If a symbol's first live tick arrives
before any of its klines — possible when the price channel is live but the history fetch
has not resolved — the tick seeds the baseline and the crossing is lost exactly as
before. There is no bounded retry after that, because a replay then would no longer be
the symbol's first evaluation.

A narrower sibling of that second residual: the "history becomes observable" hook replays
on the *first* batch that yields two usable closes, which can be a 2–3 candle WebSocket
dribble that lands before the full REST history resolves. Once decided, the wider,
informative window is never replayed, so a true crossing inside it is lost. The root
cause is the same — a replay must be the symbol's first evaluation — so the same
no-rollback-path constraint applies; noted here so it reads as a decision, not an
oversight.

A third, mid-session variant: the replay's `evaluate` is engine-wide for the symbol, but
the coordinator's pending set is a snapshot from `initAlertEngine()`. If the symbol is
still pending when the trader arms a second alert B on it, the replay's historical pair
can straddle B's target and fire it at once — even though B was armed at the current
price and the trader never saw that crossing. Skipping the replay for a symbol whose
armed set changed would take alert A down with it, which is the population this fix
targets, so that is not a trade worth making either.

**Left as documentation, not fixed here**, because closing any of these properly means either
probing stateful `evaluate()` speculatively (it seeds the baseline and can flip
`alert.active`) or evaluating a per-alert subset the engine does not expose — both need a
rollback or `set_alerts` path the engine does not have. A real fix is a follow-up, not a
comment; this bug's own acceptance criteria are met by the coverage that exists, worded
to say so precisely.

## Out of scope

- Searching multiple timeframes for a straddling pair instead of stopping at the first
  with usable history — see "Known limitation" above.
- Widening `REPLAY_MAX_CANDLES` beyond 240. The cost is negligible (see the "closes
  only" note above), but a longer window is a product decision about how old a
  crossing should still count, not a bug fix.
- Replaying highs and lows instead of closes — see "Closes only" above.

## Links

- `src/services/alertEngine/replayClosedCandles.ts` — the pure replay
- `src/services/alertEngine/legacyReplayCoordinator.ts` — when it runs, and the ordering guarantee
- `src/services/alertEngine/ruleLoopWiring.ts` — `readClosedCandles` and `readAvailableKlineTimeframes`, the history source
- `src/stores/alerts.svelte.ts` — `initAlertEngine`, the wiring
- `src/stores/market.svelte.ts` — the kline write path that triggers a replay when history lands
- `src/stores/market/applyUpdate.ts` — the pre-evaluation replay that closes the ordering window
- `technicals-wasm/src/alert_engine.rs` — `AlertEngine::evaluate`, `last_prices` (unchanged)
- `technicals-wasm/src/rule/evaluate.rs` — `rises_above_does_not_fire_when_the_price_was_already_above`,
  the semantics this fix had to preserve
- `src/stores/alerts.svelte.ts:62` — `cachy_alerts_v1` persistence
- [`FEAT-0368`](../features/FEAT-0368-alert-engine-evaluation-batching.md) — where this was found
