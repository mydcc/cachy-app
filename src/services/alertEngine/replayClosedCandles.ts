/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type { EvaluationCandle } from "../../lib/rules/types";

/**
 * BUG-0441 — give the legacy engine the history it lost across a reload.
 *
 * `AlertEngine::evaluate` is a crossing detector: it fires when its
 * `last_prices` baseline sits on one side of the target and the price it is
 * handed sits on the other. That baseline is seeded *only* by `evaluate`
 * itself and lives in the WASM instance, so it is empty on every page load —
 * while the alerts themselves are Class A data and survive in
 * `cachy_alerts_v1`. An alarm whose target was crossed while the app was
 * closed therefore had its crossing consumed by the very first live tick,
 * which seeded the baseline *past* the target and left nothing to detect. The
 * alarm stayed armed for a crossing that had already happened.
 *
 * The rule engine never had this problem, and the reason is the whole design
 * here: it derives "the previous value" from persisted candle history rather
 * than from an in-memory tick stream (`evaluate.rs`,
 * `rises_above_does_not_fire_when_the_price_was_already_above`). History
 * answers both questions at once, which is why no arming price has to be
 * invented:
 *
 * - a price that *crossed* while the app was closed leaves a pair of closes
 *   straddling the target, and fires;
 * - a price that was *always* past the target leaves no such pair, and does
 *   not fire — which is FEAT-0390's sharpest requirement, and the reason a
 *   "fire if the first tick is already past the target" shortcut would have
 *   been wrong rather than merely crude.
 *
 * So this replays closed candles through the engine unchanged, oldest first,
 * before any live tick reaches it. No Rust change, no new condition kind, and
 * the fire-once hysteresis still bounds every alarm to one firing.
 *
 * **Closes only, deliberately.** A candle whose high crossed the target but
 * whose close came back does not fire, matching both the rule evaluator and
 * the behaviour FEAT-0387 documented to traders ("no firing for a mid-candle
 * touch that recovers"). Replaying highs and lows would make the legacy path
 * *more* sensitive than the engine that replaced it.
 *
 * **Ordering is a correctness requirement, not a preference.** The replay has
 * to be the engine's first evaluation for a symbol, or its oldest close is
 * compared against a baseline already seeded by a live tick — an arbitrary
 * jump that can straddle a target in either direction and fire for nothing.
 * `initAlertEngine` therefore runs it in the same synchronous continuation as
 * the `setAlerts` push, with no `await` in between, so no WebSocket callback
 * can interleave.
 */

/**
 * Timeframes to look for history in, finest first.
 *
 * Finest first because a coarser series says the same thing about *whether* a
 * target was crossed but less about *when*. `1m` is what FEAT-0388 pinned
 * migrated rules to and therefore the series most likely to be subscribed;
 * the coarser two are what a trader charting `15m` actually has.
 */
export const REPLAY_TIMEFRAMES = ["1m", "5m", "15m"] as const;

/**
 * How far back a replay reaches, in candles.
 *
 * 240 is four hours at `1m`. The bound exists because a crossing older than
 * the window is news the trader has already lived through, not because the
 * cost matters — 240 evaluations at ~2 µs each is well under a millisecond
 * per symbol (measured in FEAT-0368).
 */
export const REPLAY_MAX_CANDLES = 240;

/** A legacy alert, reduced to what the replay needs to know about it. */
interface ReplayableAlert {
    symbol: string;
    active: boolean;
}

export interface ReplayClosedCandlesDeps {
    /** The alerts the legacy engine actually holds — uncovered ones only. */
    alerts: readonly ReplayableAlert[];
    readCandles: (symbol: string, timeframe: string) => EvaluationCandle[];
    evaluate: (symbol: string, close: string, timestampMs: number) => void;
    timeframes?: readonly string[];
    maxCandles?: number;
}

export interface ReplayReport {
    /** Symbols that had usable history and were replayed. */
    symbols: number;
    /** Closes fed to the engine in total. */
    candles: number;
    /** Symbols with an armed alert but no usable history. */
    skipped: string[];
    /** Symbols whose replay was abandoned after a throw. */
    failed: string[];
}

/** The closes of the newest `maxCandles` candles, oldest first, unusable ones dropped. */
function usableCloses(candles: EvaluationCandle[], maxCandles: number): EvaluationCandle[] {
    if (!Array.isArray(candles) || candles.length < 2) return [];
    const window = candles.length > maxCandles ? candles.slice(-maxCandles) : candles;
    return window.filter(
        (candle) =>
            candle !== null &&
            typeof candle === "object" &&
            typeof candle.close === "string" &&
            candle.close.length > 0 &&
            Number.isFinite(candle.open_time_ms),
    );
}

/**
 * BUG-0441 follow-up (review finding): the replay is only safe as the engine's
 * *first* evaluation for a symbol, because its oldest close must be compared
 * against nothing rather than against a baseline a live tick already seeded.
 * `ensureLoaded()` caches the WASM instance, so a second `initAlertEngine()`
 * call would replay into an engine some of whose symbols already hold a live
 * baseline — the exact arbitrary-jump false fire this replay exists to prevent.
 *
 * The guard lives here, not in `alerts.svelte.ts`, because under dev HMR a
 * replaced `alerts.svelte.ts` module resets its own module scope while the
 * `alertEngine` WASM singleton it guards survives; a flag up there would allow
 * a re-replay into a live baseline. This module is the replay's own state and
 * is not hot-replaced when `alerts.svelte.ts` changes.
 */
let alertHistoryReplayed = false;

/** Whether the one-shot history replay has already been attempted this session. */
export function hasAlertHistoryReplayed(): boolean {
    return alertHistoryReplayed;
}

/**
 * Runs {@link replayClosedCandles} at most once per module lifetime —
 * the guarded entry point `initAlertEngine()` should call. Returns `null` when
 * the replay was already attempted, so a second `initAlertEngine()` call is a
 * no-op for the replay step instead of a silent hazard.
 */
export function replayAlertHistoryOnce(deps: ReplayClosedCandlesDeps): ReplayReport | null {
    if (alertHistoryReplayed) return null;
    alertHistoryReplayed = true;
    return replayClosedCandles(deps);
}

/**
 * Feeds each armed symbol's recent closed candles through `evaluate`.
 *
 * Never throws: one unreadable series or one refusing evaluation must not stop
 * the others, and must never stop startup. The report says what happened so
 * the caller can log it — a silent replay would be BUG-0382's shape again.
 */
export function replayClosedCandles(deps: ReplayClosedCandlesDeps): ReplayReport {
    const timeframes = deps.timeframes ?? REPLAY_TIMEFRAMES;
    const maxCandles = deps.maxCandles ?? REPLAY_MAX_CANDLES;
    const report: ReplayReport = { symbols: 0, candles: 0, skipped: [], failed: [] };

    const symbols: string[] = [];
    for (const alert of deps.alerts ?? []) {
        if (alert === null || typeof alert !== "object") continue;
        if (!alert.active || typeof alert.symbol !== "string" || alert.symbol.length === 0) continue;
        if (!symbols.includes(alert.symbol)) symbols.push(alert.symbol);
    }

    for (const symbol of symbols) {
        try {
            let closes: EvaluationCandle[] = [];
            for (const timeframe of timeframes) {
                closes = usableCloses(deps.readCandles(symbol, timeframe), maxCandles);
                if (closes.length >= 2) break;
                closes = [];
            }

            if (closes.length === 0) {
                report.skipped.push(symbol);
                continue;
            }

            for (const candle of closes) {
                deps.evaluate(symbol, candle.close, candle.open_time_ms);
                report.candles += 1;
            }
            report.symbols += 1;
        } catch {
            // The symbol is left in whatever state its partial replay reached.
            // That is safe in the only direction that matters: a partial replay
            // has fed older closes than the live stream is about to, so the next
            // live tick re-baselines it, and the fire-once hysteresis already
            // bounds anything that did fire.
            report.failed.push(symbol);
        }
    }

    return report;
}
