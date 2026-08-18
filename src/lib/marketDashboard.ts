/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Market Dashboard presentation logic.
 *
 * Extracted from MarketDashboardModal.svelte so it can be tested directly: the
 * repo has no working Svelte component test setup (vitest resolves Svelte's
 * server build), and the rules below are the ones that must not regress
 * silently -- they decide whether a user sees a trading signal or an absence of
 * one. Getting that distinction wrong is what made an unanalysed symbol render
 * as "Strong Sell" (FEAT-0233).
 */

import type { SymbolAnalysis, TrendState } from "../stores/analysis.svelte";
import type { TranslationKey } from "../locales/schema";

/** Favourites analysed when `analyzeAllFavorites` is off. Mirrors marketAnalyst. */
export const TOP_FAVOURITES_COUNT = 4;

/** Neutral point of the confluence scale. Not zero -- zero is "Strong Sell". */
export const NEUTRAL_SCORE = 50;

export interface DashboardRow {
    symbol: string;
    analysis: SymbolAnalysis | undefined;
    /** False when the analyst has produced nothing for this symbol at all. */
    analysed: boolean;
    /** True when the symbol sits outside the current analysis scope. */
    outOfScope: boolean;
}

/**
 * Symbols the analyst will actually visit. Mirrors
 * marketAnalyst.getAnalysisScope(): a symbol outside it is not "pending", it is
 * "never", and the UI should say so rather than show a perpetual spinner.
 */
export function analysisScope(favourites: string[], analyzeAll: boolean): string[] {
    return analyzeAll ? favourites : favourites.slice(0, TOP_FAVOURITES_COUNT);
}

/**
 * Build the dashboard rows.
 *
 * Analysed rows sort by score; unanalysed rows go last. They used to be given a
 * placeholder score of 0 and sorted in with the rest -- and 0 is the bottom of
 * the confluence scale, so "we have not looked at this yet" rendered as the
 * strongest sell signal on the board.
 */
export function buildRows(
    favourites: string[],
    results: Record<string, SymbolAnalysis>,
    analyzeAll: boolean,
): DashboardRow[] {
    const scope = new Set(analysisScope(favourites, analyzeAll));

    return favourites
        .map((symbol): DashboardRow => {
            const analysis = results[symbol];
            return {
                symbol,
                analysis,
                analysed: !!analysis,
                outOfScope: !scope.has(symbol),
            };
        })
        .sort((a, b) => {
            if (a.analysed !== b.analysed) return a.analysed ? -1 : 1;
            return (b.analysis?.confluenceScore ?? 0) - (a.analysis?.confluenceScore ?? 0);
        });
}

/** Rows whose analysis is present AND complete -- the only ones safe to aggregate. */
function usableRows(rows: DashboardRow[]): DashboardRow[] {
    return rows.filter((r) => r.analysed && r.analysis?.quality !== "partial");
}

/**
 * Average 1h RSI across analysed favourites, or null when there is nothing to
 * average.
 *
 * Null rather than a number: the previous version divided by the full
 * favourites count while summing only what existed, and folded each
 * placeholder's fabricated RSI of 50 into the mean. With most favourites
 * unanalysed that produced a confident-looking middle reading that described
 * nothing at all.
 */
export function marketHeat(rows: DashboardRow[]): number | null {
    const usable = usableRows(rows);
    if (usable.length === 0) return null;
    const sum = usable.reduce((acc, r) => acc + parseFloat(r.analysis!.rsi1h), 0);
    return sum / usable.length;
}

/**
 * Share of favourites trading above their 4h EMA 200, with the sample size it
 * was computed from. Only timeframes that produced a real reading count --
 * "unknown" is missing data, not a bearish vote.
 */
export function marketBreadth(rows: DashboardRow[]): { percent: number; sample: number } | null {
    const measured = rows.filter(
        (r) => r.analysis?.trends?.["4h"] === "bullish" || r.analysis?.trends?.["4h"] === "bearish",
    );
    if (measured.length === 0) return null;
    const bullish = measured.filter((r) => r.analysis!.trends!["4h"] === "bullish").length;
    return { percent: (bullish / measured.length) * 100, sample: measured.length };
}

/**
 * Strongest directional bias among analysed favourites, measured as DISTANCE
 * FROM NEUTRAL. A score of 8 is as strong a read as 92, just the other way;
 * ranking by raw score could only ever surface longs.
 */
export function topOpportunity(rows: DashboardRow[]): DashboardRow | undefined {
    let best: DashboardRow | undefined;
    let bestDistance = -1;
    for (const row of usableRows(rows)) {
        const distance = Math.abs((row.analysis?.confluenceScore ?? NEUTRAL_SCORE) - NEUTRAL_SCORE);
        if (distance > bestDistance) {
            bestDistance = distance;
            best = row;
        }
    }
    return best;
}

export type SignalTone = "bullish" | "bearish" | "flat";

/** i18n key + colour tone for a confluence level. */
export function signalFor(analysis: SymbolAnalysis | undefined): {
    key: TranslationKey;
    tone: SignalTone;
} {
    switch (analysis?.confluenceLevel) {
        case "Strong Buy":
            return { key: "app.marketDashboard.signalStrongBuy", tone: "bullish" };
        case "Buy":
            return { key: "app.marketDashboard.signalBuy", tone: "bullish" };
        case "Sell":
            return { key: "app.marketDashboard.signalSell", tone: "bearish" };
        case "Strong Sell":
            return { key: "app.marketDashboard.signalStrongSell", tone: "bearish" };
        default:
            return { key: "app.marketDashboard.signalNeutral", tone: "flat" };
    }
}

/**
 * CSS classes for one trend cell.
 *
 * `unknown` renders hollow so "we did not measure this" cannot be mistaken for
 * "we measured it and it was flat".
 */
export function trendCellClass(state: TrendState | undefined): string {
    if (state === "bullish") return "bg-[var(--success-color)]";
    if (state === "bearish") return "bg-[var(--danger-color)]";
    if (state === "neutral") return "bg-[var(--text-secondary)]/40";
    return "border border-dashed border-[var(--text-secondary)]/50";
}
