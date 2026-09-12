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

/**
 * BUG-0441 — when the legacy crossing baseline may be rebuilt from history.
 *
 * The replay itself is a pure function (`replayClosedCandles`); this module is
 * the small state machine that decides *when* it runs. The problem it solves is
 * timing: `initAlertEngine()` runs at layout mount, but the market store is
 * empty then — klines arrive asynchronously as the chart/watchlist subscribes,
 * which is after startup. Replaying once at init therefore usually finds no
 * history, marks nothing, and lets the first live tick consume the crossing the
 * fix exists to recover.
 *
 * So the replay is attempted at three points, in order of preference:
 *
 * 1. **At startup**, for symbols whose history is already present.
 * 2. **The moment a symbol's history becomes observable** — the market store's
 *    kline write path calls `noteLegacyReplaySeriesObserved`, which is the
 *    first point at which the history the bug report is about actually exists.
 * 3. **Immediately before a symbol's first live evaluation** — the last moment
 *    at which a replay is still safe, and the only guaranteed one.
 *
 * Ordering is the reason the third point exists and the reason this state
 * machine cannot simply retry forever: `AlertEngine::evaluate` seeds its
 * baseline as a side effect, so a replay is only valid as the engine's *first*
 * evaluation for that symbol. Once a live tick has been evaluated — or a
 * partially replayed symbol has thrown — the symbol is marked decided and never
 * replayed again. A late replay would compare a fresh close against a live
 * baseline: an arbitrary jump that can fire for nothing.
 *
 * No deferral: the first live evaluation is never withheld waiting for history.
 * A symbol whose history never arrives degrades to exactly the pre-fix
 * behaviour (the crossing is lost) rather than to an alert that silently never
 * evaluates at all.
 */

import { replayClosedCandles, type ReplayReport } from "./replayClosedCandles";
import type { EvaluationCandle } from "../../lib/rules/types";

export interface LegacyReplaySource {
    readCandles: (symbol: string, timeframe: string) => EvaluationCandle[];
    timeframesFor?: (symbol: string) => readonly string[];
    evaluate: (symbol: string, close: string, timestampMs: number) => void;
}

let source: LegacyReplaySource | null = null;
let pending = new Set<string>();
let decided = new Set<string>();

/** Wires the readers the replay needs. Safe to call again; last write wins. */
export function configureLegacyReplay(next: LegacyReplaySource): void {
    source = next;
}

/**
 * The symbols with an armed alert on the legacy engine, i.e. the ones a replay
 * could still recover. Replacing the set is intentional: coverage changes
 * re-derive it, and `decided` is what prevents a second replay of a symbol
 * whose ordering window has already closed.
 */
export function setPendingLegacyReplaySymbols(symbols: Iterable<string>): void {
    pending = new Set(symbols);
}

/** Test seam: forget everything so a fresh module graph starts clean. */
export function resetLegacyReplayState(): void {
    source = null;
    pending = new Set();
    decided = new Set();
}

type Attempt = "replayed" | "skipped" | "failed";

function attempt(symbol: string): Attempt {
    if (source === null) return "skipped";
    const report = replayClosedCandles({
        alerts: [{ symbol, active: true }],
        readCandles: source.readCandles,
        timeframesFor: source.timeframesFor,
        evaluate: source.evaluate,
    });
    if (report.replayed.includes(symbol)) return "replayed";
    if (report.failed.includes(symbol)) return "failed";
    return "skipped";
}

/**
 * Attempts the replay for every not-yet-decided pending symbol in one batch and
 * returns the report for the caller to log. Returns `null` when there is
 * nothing to do, so a startup with no armed alerts or no configured source
 * stays silent.
 */
export function replayPendingLegacySymbolsAtStartup(): ReplayReport | null {
    if (source === null) return null;
    const candidates = Array.from(pending).filter((symbol) => !decided.has(symbol));
    if (candidates.length === 0) return null;

    const report = replayClosedCandles({
        alerts: candidates.map((symbol) => ({ symbol, active: true })),
        readCandles: source.readCandles,
        timeframesFor: source.timeframesFor,
        evaluate: source.evaluate,
    });

    // A symbol that replayed or threw is decided; only "no history yet" stays
    // pending for the later hooks to retry.
    for (const symbol of report.replayed) decided.add(symbol);
    for (const symbol of report.failed) decided.add(symbol);
    return report;
}

/**
 * Called from the market store's kline write path. Replays a pending symbol as
 * soon as history exists for it, before the next live tick — the point the
 * startup-only version missed.
 */
export function noteLegacyReplaySeriesObserved(symbol: string): void {
    if (source === null || decided.has(symbol) || !pending.has(symbol)) return;
    const result = attempt(symbol);
    if (result !== "skipped") decided.add(symbol);
}

/**
 * The ordering guarantee, called before a symbol's live evaluation. Whatever
 * history is present is replayed now; then the symbol is decided either way, so
 * a later replay can never be compared against the baseline this evaluation is
 * about to seed.
 */
export function replayBeforeLegacyEvaluation(symbol: string): void {
    if (source === null || decided.has(symbol) || !pending.has(symbol)) return;
    attempt(symbol);
    decided.add(symbol);
}
